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
workflow; conversation SSE is described below. Login operations are transient; credentials
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
| DELETE | `/v1/projects/:id` | Archive an idle project; 409 `project_busy` when sessions have pending work. |
| GET | `/v1/projects/archive` | List archived project registrations. |
| POST | `/v1/projects/:id/stop-and-archive` | Cancel queued input, stop active sessions and archive after they settle. |
| POST | `/v1/projects/:id/restore` | Restore the original project registration and its sessions. |

`projects.sqlite` lives beside the provider database and uses private filesystem permissions.
Registration requires an existing readable/writable/traversable absolute directory; symlink aliases
resolve to one canonical path. Missing directories remain registered and unavailable. Responses are
uncached, schemas reject unknown fields, and internal failures are sanitized. Preset icons/colors and display names are editable. No filesystem browser or directory rename. Project sessions support text generation and read-only inspection tools. `test/projects.test.ts` verifies persistence,
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
leave hidden staging directories. Published files remain intact on registry errors and archival.

Git inspection is on demand. Commands have five-second/1 MiB limits, omit optional locks and use isolated configuration. Errors are sanitized. No history, remote fetch, checkout or worktree mutation. Tests cover empty/non-Git, unborn/detached branches, linked/locked worktrees with newline paths, missing directories, unknown registrations, origin policy and bare repositories. Formats follow [Git worktree](https://git-scm.com/docs/git-worktree) and [for-each-ref](https://git-scm.com/docs/git-for-each-ref).

Project appearance updates accept 32 preset icon IDs and eight colors. Invalid IDs remain validation errors; icon selection never changes project files.

## Session HTTP API

Pi Durable 1.4 owns each session's SQLite transcript, tasks, documents and inbox. Console's
`harnesses.sqlite` maps projects to numbered sessions, each opened by exactly one Durable Harness.
Session files live under `~/.local/share/console/sessions`. Each standalone session uses a private
`workspaces/<sessionId>` directory under that root. Console retains the directory across restarts.
Startup resumes standalone and available-project sessions; browser disconnect never cancels admitted work.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/projects/:id/sessions` | Project-owned harness/session index. |
| POST | `/v1/projects/:id/sessions` | `{}`; create the next numbered session and Main, 201. |
| GET | `/v1/standalone` | Standalone sessions newest first. |
| POST | `/v1/standalone` | `{}`; create a numbered standalone conversation, 201. |
| GET | `/v1/standalone/:sessionId` | Standalone session and root conversation ID; rejects project sessions. |
| GET | `/v1/sessions/:sessionId/conversations` | Session metadata and first 200 conversations; `more` reports truncation. |
| POST | `/v1/sessions/:sessionId/conversations` | `{}`; create the next numbered conversation in a project session, 201. |
| POST | `/v1/sessions/:sessionId/conversations/:conversationId/messages` | `{content,requestId,model?,thinkingLevel?}`; validated choices and UUID deduplication, durable admission, 202. |
| GET | `/v1/sessions/:sessionId/conversations/:conversationId/submissions` | Latest safe completion status; supports failure display after reconnect. |
| GET | `/v1/sessions/:sessionId/conversations/:conversationId/submissions/:submissionId` | Persisted admission/completion state, scoped to its conversation. |
| GET | `/v1/sessions/:sessionId/conversations/:conversationId/events` | SSE current snapshot, then committed updates; disconnect only detaches. |
| GET | `/v1/sessions/:sessionId/conversations/:conversationId/history` | Text history page; round-trip optional `cursor` from response `next`. |
| POST | `/v1/sessions/:sessionId/stop` | `{}`; stop all session conversations and queued inputs. |

Conversation/submission IDs are numeric Durable IDs, scoped to the session UUID. Creation requires an available project; model-free defaults are created on project registration. New
input requires an enabled available favorite model and a supported thinking level. Duplicate message retries
return their original record even if model preferences changed. Creation itself is not deduplicated.
Project archive preserves source files and Durable databases. Archived sessions are excluded from startup recovery. Write/process tools, forks, subagents, project triggers and per-conversation Resume are deferred.

SSE uses explicit safe text projections, 50 recent entries, 32 streams and bounded slow-client handling.
History retains older entries. SQLite file ownership excludes a competing local runtime; no distributed
host coordination or production-scale retention is implemented. Fake-provider tests cover persistence,
deduplication after reopen, isolated conversations, validation/origin checks, stream detach/reconnect,
session-wide Stop and SIGKILL recovery. Real-provider inference remains unverified.

Project registration, new-project setup and public clone initialize Session 1/Main automatically.
Startup initializes missing defaults for older registrations. Session numbers are allocated under an
SQLite transaction/unique index; conversation names use a Durable session counter. Existing index
records are numbered without changing their UUIDs or transcript files. Additional conversations
inherit Main's stored model/thinking settings; no creation dialog/configuration is required.

Message selection is validated before admission. Changing model/thinking while working or queued
returns 409; unsupported thinking levels return 400. Model changes clear an incompatible previous
thinking choice. Duplicate message keys return the original admission before revalidating preferences.

## HTTP connection policy

`http/connection.ts` configures origin restrictions, CORS, health and the connection handshake.
`createApp` accepts an optional HttpConnectionPolicy at composition time. Its authorization hook
runs before feature handlers. The default policy retains local website origins and unauthenticated
access. The entrypoint chooses the listener address; future deployment/authentication integration
can supply a different policy while retaining provider, project and session route contracts.

## Read-only project inspection

Project conversations receive list_directory, read_file and search_text through a built-in Durable
extension and the ProjectExecutor interface. Scope is the registered project directory; standalone
chats do not receive these tools. The current local adapter has no OS sandbox. It checks paths,
limits output/work and returns safe failure codes; writes, subprocesses and network tools are absent.
See architecture for limits, replay semantics and the limitations of application path checks.
`test/execution.test.ts` and `test/project-inspection.test.ts` verify real-file evidence, failures,
bounds, session reopening and abrupt-crash recovery with committed tool results using a fake model.
