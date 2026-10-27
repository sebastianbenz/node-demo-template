import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
// App name comes from package.json (set by scripts/new-app.sh); APP_NAME env var overrides it.
const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const APP_NAME = process.env.APP_NAME ?? pkg.name;
const PUBLIC_DIR = new URL("./public/", import.meta.url).pathname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Sliding-window rate limit: RATE_LIMIT requests per minute per client IP (0 disables).
// Coolify's Traefik sets X-Forwarded-For; the first entry is the client.
const RATE_LIMIT = Number(process.env.RATE_LIMIT ?? 60);
const hits = new Map();
function rateLimited(req) {
  if (!RATE_LIMIT) return false;
  const ip = (req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear(); // crude memory bound
  return recent.length > RATE_LIMIT;
}

async function serveStatic(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = join(PUBLIC_DIR, path === "/" ? "index.html" : path);
  if (!file.startsWith(PUBLIC_DIR)) return false;
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  // --- Basic per-IP rate limit for API routes (public demos are an open wallet otherwise) ---
  if (url.pathname.startsWith("/api/") && rateLimited(req)) {
    res.writeHead(429, { "content-type": "application/json", "retry-after": "60" });
    return res.end(JSON.stringify({ error: "Too many requests" }));
  }

  // --- API routes -----------------------------------------------------------
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, app: APP_NAME, uptime: process.uptime() }));
  }

  if (url.pathname === "/api/hello") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ message: `Hello from ${APP_NAME}!`, time: new Date().toISOString() }));
  }

  // --- Static files from ./public ------------------------------------------
  if (req.method === "GET" && (await serveStatic(req, res))) return;

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`${APP_NAME} listening on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown so Coolify deploys don't drop requests.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
