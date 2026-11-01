# Console

A TypeScript workspace with a local backend and a separately running website:

| Application | Address | Behavior |
| --- | --- | --- |
| Fastify server | `http://127.0.0.1:3000/health` | Returns `{"status":"ok"}` |
| Next.js website | `http://127.0.0.1:3001/` | Workspace, device management and settings |

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

## Connect

Open [Connections](http://127.0.0.1:3001/settings/connections), add a named device at `http://127.0.0.1:3000`,
then open Device settings and select Connect. The left rail lists devices; the adjacent panel shows
the selected device's navigation. Selecting a device alone does not connect.
This increment uses URL-only connections on the same machine; no authentication is implemented.
Disconnect leaves the backend running. Reload keeps saved device bookmarks but starts disconnected.

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
