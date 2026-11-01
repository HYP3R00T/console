# Console

A clean TypeScript workspace with two independent applications:

- Fastify server: `GET http://127.0.0.1:3000/health` returns `{"status":"ok"}`.
- Next.js website: `http://127.0.0.1:3001/` displays "Hello, world!".

Install tools with `mise install`, then dependencies with `pnpm install --frozen-lockfile`.
Run both applications with `mise run dev`. No environment file or application configuration is required.

[Requirements](docs/requirements.md) · [Architecture](docs/architecture.md) ·
[Server](docs/packages/server.md) · [Web](docs/packages/web.md) ·
[Feature inventory](docs/features.md) · [Releases](docs/releases.md)
