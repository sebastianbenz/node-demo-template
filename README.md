# Node demo template

Minimal zero-dependency Node.js app for `*.sebastianbenz.de`, deployed by Coolify from this repo.

- `server.js` — HTTP server: `/health`, `/api/hello`, static files from `public/`.
- `Dockerfile` — `node:22-alpine`, runs as the `node` user, health check built in.

## Security defaults (keep them)

- Base image pinned by major version; every push rebuilds so OS/Node patches land.
- Runs as non-root; no privileged mode, no host mounts.
- API routes are rate-limited per IP (`RATE_LIMIT` requests/minute, default 60, `0` disables).
- Secrets go in Coolify → *Environment Variables*, never in the repo (`.env*` is git- and docker-ignored).
- If the demo calls a paid API, cap spend in the provider console as well.
