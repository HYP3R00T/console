# Server

A Node.js/TypeScript Fastify application, listening on `127.0.0.1:3000`.

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | HTTP 200, `{"status":"ok"}`; HTTP liveness only. |
| GET | `/v1/connection` | HTTP 200, `{"product":"console","apiVersion":1}`; uncached protocol check. |

The production/dev entrypoint also registers the provider endpoints below. API endpoints are unauthenticated in this local development
increment. Browser origins are restricted to `http://127.0.0.1:3001` and `http://localhost:3001`
using an explicit Origin check and `@fastify/cors`; other browser origins receive 403.
The CORS plugin handles GET/POST/PUT/DELETE preflights with Content-Type and without cookies. CORS is not authentication.

## Commands

After the [shared setup](../../README.md#development), run `mise run dev:server`.
For production, run `pnpm build`, then `pnpm --filter @console/server start`.
Fastify provides native JSON logs. Ctrl+C closes the server; development uses Node watch mode.
Provider storage is created automatically at `~/.local/share/console/providers.sqlite`. No custom flags
or environment file/configuration is required. The database contains private plaintext credentials
protected by mode 0600; do not publish it.

The [architecture](../architecture.md) maps source ownership. `test/app.test.ts` checks liveness
and a missing route; `test/connection.test.ts` checks the connection contract and origin policy.
These tests use Fastify injection without opening a port. Shared checks are in the
[README](../../README.md#checks). Use the owner's development processes without restarting them.

## Provider HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/providers` | Safe provider summaries, login methods and enabled count. |
| GET | `/v1/providers/:id/models` | Catalog metadata, favorites and availability flags. |
| POST | `/v1/providers/:id/login` | Start provider-owned login; body `{type: "api_key" or "oauth"}`. |
| GET | `/v1/provider-logins/:id` | Observe the current prompt/events/result. |
| POST | `/v1/provider-logins/:id/answer` | Answer `{promptId, value}`; values are never returned. |
| DELETE | `/v1/provider-logins/:id` | Cancel pending login. |
| PUT | `/v1/providers/:id` | Set `{enabled: boolean}`; stored credentials required. |
| DELETE | `/v1/providers/:id` | Cancel login and delete local credentials/favorites/cache. |
| POST | `/v1/providers/:id/refresh` | Explicit refresh for an enabled provider; static catalogs are no-ops. |
| PUT | `/v1/providers/:id/models/:model/favorite` | Set `{favorite: boolean}`; URL-encode model IDs. |
| GET | `/v1/models/favorites` | Only enabled, available favorite chat models. |

Configured means stored credentials, not validated inference access. Counts exclude disabled records.
Removal leaves the built-in provider discoverable as unconfigured and does not revoke upstream grants.
Responses are uncached; SDK/storage failures are sanitized. HTTP is sufficient for this configuration
workflow; no SSE or WebSocket endpoint is implemented yet. Login operations are transient; credentials
and favorites survive restart. `test/providers.test.ts` covers injected fake-provider login, OAuth,
cancellation/removal races, private persistence, credential redaction, favorites and validation/CORS.

## Project HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/projects` | Registrations and current directory availability. |
| POST | `/v1/projects` | Register `{name, path}`; returns 201 or 409 for a duplicate canonical path. |
| GET | `/v1/projects/:id` | Project metadata and availability; 404 if unregistered. |
| GET | `/v1/projects/:id/git` | Read-only local branches/current branch and worktrees; repository/non-repository/unavailable states. |
| PUT | `/v1/projects/:id` | Update `{name,icon,color}`; display label only, path unchanged. |
| DELETE | `/v1/projects/:id` | Remove registration only; never delete directory/files. |

`projects.sqlite` lives beside the provider database and uses private filesystem permissions.
Registration requires an existing readable/writable/traversable absolute directory; symlink aliases
resolve to one canonical path. Missing directories remain registered and unavailable. Responses are
uncached, schemas reject unknown fields, and internal failures are sanitized. Preset icons/colors and display names are editable. No filesystem browser, directory rename, sessions or execution. `test/projects.test.ts` verifies persistence,
alias/concurrent duplicates, invalid input, availability, origin rejection and preservation of files.

## Project defaults and creation

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/machine/settings` | Default `projectsRoot` and current availability. |
| PUT | `/v1/machine/settings` | Save `{projectsRoot}`; no directory creation/migration. |
| POST | `/v1/projects/create` | `{name,folder,createParents}` → new Git repository/registration, 201. |
| POST | `/v1/projects/clone` | Same body plus `repository` → public HTTPS clone/registration, 201. |

The default root is backend `~/Projects`. Folder names are one portable segment; project display
names can contain spaces. `createParents` must be explicitly true to make missing parents. Destination
collisions return 409. Git must be installed; commands use isolated configuration with no personal
credentials/hooks/templates/submodules. Public HTTPS only; no redirect, SSH or private login support.
Git operations time out after two minutes and cancel when their HTTP response connection closes.
The service allows two concurrent setups. Failed staging is cleaned; an abrupt process crash may
leave hidden staging directories. Published files remain intact on registry errors and unregister.

Git inspection is on demand. Commands have five-second/1 MiB limits, omit optional locks and use isolated configuration. Errors are sanitized. No history, remote fetch, checkout or worktree mutation. Tests cover empty/non-Git, unborn/detached branches, linked/locked worktrees with newline paths, missing directories, unknown registrations, origin policy and bare repositories. Formats follow [Git worktree](https://git-scm.com/docs/git-worktree) and [for-each-ref](https://git-scm.com/docs/git-for-each-ref).

Project appearance updates accept 32 preset icon IDs and eight colors. Invalid IDs remain validation errors; icon selection never changes project files.
