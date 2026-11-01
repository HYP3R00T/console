# Console

A minimal local interface for agent work: **project → work session → one conversation**.
Pi Durable runs and persists each session. Native tools execute on the backend host.
The backend starts with built-in defaults; no environment file or configuration file is required.
After building, run `pnpm --filter @console/server start`. Use `--help` for optional startup arguments.

- [Requirements](docs/requirements.md): the MVP and its deliberate exclusions.
- [Architecture](docs/architecture.md): ownership, execution and storage boundaries.
- [Server guide](docs/packages/server.md): source map and HTTP API contract.
- [Web guide](docs/packages/web.md): client and fixed local proxy.
- [Feature inventory](docs/features.md): stable capability IDs, status and verification limits.

The MVP uses a fresh storage namespace, retaining earlier experimental files without migration.
