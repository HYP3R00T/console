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
then expand the first column and the device disclosure and select Connect. The left rail lists devices; the adjacent panel shows
the selected device's navigation. Selecting a device alone does not connect.
This increment uses URL-only connections on the same machine; no authentication is implemented.
Disconnect leaves the backend running. Reload keeps saved device bookmarks but starts disconnected.
Once connected, open Machine settings → Providers to sign in and choose favorite models.
Provider credentials/favorites live on the backend; the website never stores provider secrets.

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

Register existing project directories from Add project in the workspace sidebar. Registrations live
on the selected backend; removing one preserves its directory and files. Sessions and execution are
not implemented yet.

Machine settings → Projects sets the default projects folder (initially backend `~/Projects`).
Add project supports existing directories, new Git repositories, and public HTTPS clones.
Install Git on the backend for new/clone setup; no personal Git credentials/configuration is needed.
Private repository authentication and SSH cloning are not implemented yet.
