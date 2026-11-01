# Console

A TypeScript workspace with two independent applications:

| Application | Address | Behavior |
| --- | --- | --- |
| Fastify server | `http://127.0.0.1:3000/health` | Returns `{"status":"ok"}` |
| Next.js website | `http://127.0.0.1:3001/` | Displays "Hello, world!" |

## Development

```bash
mise install
pnpm install --frozen-lockfile
```

Run each application in its own terminal:

```bash
mise run dev:server
```

```bash
mise run dev:web
```

`pnpm dev:server` and `pnpm dev:web` are equivalent alternatives. Both use their framework's
native terminal output. No environment file or application configuration is required.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
prek run --all-files
```

## Documentation

- [Requirements](docs/requirements.md): current scope.
- [Architecture](docs/architecture.md): source structure and ownership.
- [Server](docs/packages/server.md) and [Web](docs/packages/web.md): application commands and contracts.
- [Feature inventory](docs/features.md): implementation status and historical IDs.
- [Releases](docs/releases.md): versions and Changesets.
