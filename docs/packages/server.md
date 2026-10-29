# Server

`packages/server` is the private `@console/server` workspace package. It uses TypeScript,
Node.js LTS, and Fastify. It exposes `GET /health`, returning `{"status":"ok"}`, alongside the local Console API.
This checks HTTP liveness, not model access. Pi Durable supplies isolated persistent sessions; provider settings, model/thinking configuration, and credential storage are implemented. Opt-in sandboxed file, HTTP, and command tools are available. Explicit Setup access supports package installation and checks. Console user authentication is not implemented.

## Run and verify

From the repository root, run `mise install`, then `pnpm install --frozen-lockfile`.

- `pnpm dev:server`: run source with Node's watch mode.
- `mise run dev`: run the server and Next.js web app together, directly on the host.
- `pnpm --filter @console/server typecheck`: check source and test types.
- `pnpm --filter @console/server test`: run Node's test runner with Fastify HTTP injection.
- `pnpm --filter @console/server build`: compile source into `packages/server/dist`.
- `pnpm --filter @console/server start`: run the compiled server after building.

The server binds to `127.0.0.1:3000` by default. `HOST` and `PORT` override these values.
Port `0` lets the operating system select an available port; the listening address is logged.
`SIGINT` and `SIGTERM` close the HTTP server through Fastify's shutdown lifecycle.

## Structure and extension

The source tree is organized by responsibility. Start at the owning domain, not a flat list
of unrelated implementation files. `src/main.ts` remains the development/production entry point;
`src/app.ts` constructs Fastify without opening a port.

| Folder | Owns | Starting points |
| --- | --- | --- |
| `src/http/` | Application composition, authentication/error boundary | `console.ts`, `errors.ts` |
| `src/models/` | Pi provider authentication, catalogs and persisted credentials | `providers.ts`, `credentials.ts` |
| `src/platform/` | Data-directory resolution and machine defaults | `configuration.ts`, `machine-settings.ts` |
| `src/connections/` | Backend compatibility registry/proxy | `backends.ts`; the web owns its current connection registry |
| `src/projects/` | Workspace catalog, directory registration and clone lifecycle | `workspaces.ts` |
| `src/sessions/` | Session catalog and HTTP operations | `catalog.ts`, lifecycle `routes.ts`, `conversation-routes.ts`, `schemas.ts` |
| `src/runtime/` | One Harness, its conversations and durable operations | `session.ts` assembles `configuration.ts`, `input.ts` and read-only `view.ts` |
| `src/sandbox/` | Policy validation, nono supervision and restricted workers | `policy.ts`, `runner.ts`, `worker.ts`, `pi-tools.ts`, `resources.ts`, `tools.ts` |

`runtime/context.ts` describes shared session resources and the mutation queue. Configuration and
input operations use that same queue; extracted files do not create independent locks or Harnesses.
`runtime/documents.ts` retains document kinds/versions; `coordination.ts` and `plan.ts` own agent tools.
`runtime/purge.ts` remains the pinned-schema maintenance adapter. HTTP code calls session/runtime
operations; provider errors use the shared HTTP error helper without making other domains depend
on provider authentication. Sandbox workers never receive credential stores or Harness authority.

Node runs erasable TypeScript directly during development and tests. This does not check types;
run the separate type-check command. Production uses compiled JavaScript with the same domain
layout under `dist/`. Worker/resource module URLs and package-metadata paths must work in both
layouts. Tests use the actual owning modules rather than compatibility re-export files.

Keep runtime dependencies in this package's manifest. See [architecture](../architecture.md#first-pi-integration)
for storage, request identity and recovery semantics. Behavior changes still require the matching
[feature inventory](../features.md) entry; moving source files does not mark missing features delivered.

## Local API

All routes below use `/v1`; mutations require `X-Console-Request: 1`. JSON bodies are validated.

- `GET /backends`, `POST /backends`, `DELETE /backends/:id`, `POST /backends/:id/check`: local-hub connection management. POST accepts `{ name, url, token }`; submitting an existing origin replaces its name/token after a successful probe. Tokens are never returned.
- `/backends/:id/api/*`: bounded authenticated proxy for Console resources on a saved backend.
- `GET /workspaces`, `POST /workspaces`, `PATCH /workspaces/:id`: list, register/create, or rename projects. Creation takes `{ name, path, requestId, createDirectory? }`; filesystem paths belong to the selected backend.
- `GET /machines`: this backend's stable machine ID, hostname/configured name, platform, session counts, active storage paths/source, and supported capabilities. It describes that execution backend; use `/backends` for the hub connection registry.
- `GET /sandbox/support`: pinned nono availability/version; each actual tool call must still apply its policy successfully.
- `GET /providers` (or `?connected=true` for conversation pickers): safe configuration status, supported connection methods, and chat models with supported thinking levels and context capacity.
- `POST /providers/:id/refresh`: ask Pi to refresh a dynamic model catalog.
- `POST /connections`: start `{ "provider": "openai", "method": "oauth" }` (or `api_key`).
- `GET /connections/current` and `GET /connections/:id`: notifications and the current prompt.
- `POST /connections/:id/answer`: submit `{ "promptId": "...", "value": "..." }`.
- `DELETE /connections/:id`: cancel a pending flow; `DELETE /providers/:id`: remove saved credentials. Ambient credentials are unaffected.
- `GET /sessions`: named sessions and their current status; unavailable databases are reported individually. `?include=conversations` adds active conversation summaries to each healthy session for batched navigation. The default response remains unchanged; Trash is excluded. Project membership is read once per list, and each runtime reuses one task inspection across its conversation summaries.
- `POST /sessions`: create `{ "requestId": "unique-creation-id", "workspaceId": "optional-project-id" }`; retries return the same session.
- `GET /sessions/:id`: recent history, partial answer, saved configuration, and lifecycle state. Assistant messages include visible `reasoning` blocks; `partialReasoning` carries live blocks with a `streaming` flag. Redacted content and thinking signatures are omitted.
- `PATCH /sessions/:id/config`: save `{ "provider": "...", "model": "...", "thinkingLevel": "high" }`. The provider must be connected and the level supported by that model. Unfinished work returns 409.
- `PATCH /sessions/:id/sandbox`: save `{ "enabled": true, "workspace": "/project", "readPaths": [], "writePaths": [], "network": "blocked" }`. Paths must exist and be absolute; unfinished work returns 409. Enabled policies require successful native startup before committing.
- `POST /sessions/:id/messages`: submit `{ "text": "...", "requestId": "unique-input-id" }` using saved settings; returns an admission identity with HTTP 202. Duplicate IDs identify the original input within that session.
- `POST /sessions/:id/cancel` and `POST /sessions/:id/resume`: explicit lifecycle controls.

The former unscoped `/conversation` and `/messages` development routes have been replaced. Existing conversation data is registered in place as the `default` session; no transcript or credential files are moved.

`CONSOLE_DATA_DIR` selects persistent storage and must be absolute. Machine names, project directories, and model defaults are edited under Machines and persisted in the catalog; the initial name is the OS hostname. `.env.example` records these options. Mise loads the ignored `.env`; restart the backend after changing it. The dashboard at `/machines` exposes the effective paths. Changing storage selects a different database set and does not move history or credentials. To retain data, stop the backend and copy its complete data directory before switching. Tests always use temporary directories and Pi's scripted test provider; they never use personal credentials or paid inference. Live subscription login and inference require the user to complete provider authorization and are not verified by those tests.

## Sandboxed tools

Mise supplies nono 0.80.0. Run `mise install nono` after updating; `CONSOLE_NONO_BIN` may point to the trusted executable when starting without mise. The archived `nono-ts` npm package is not used. Configuration lives in Pi's `console.sandbox` document. See [architecture](../architecture.md#configurable-tool-sandbox) for ownership and exact boundaries.

`read_file` and `list_directory` are replay-safe. `create_directory` recursively creates directories within explicit writable grants. `write_file` is offered only with writable directories; `fetch_url` only with unrestricted network. Neither creation/writes nor HTTP GET automatically replays after interruption. A fresh nono worker enforces every call; credentials remain in Fastify. `run_command` requires the separate `commands: true` policy setting, never replays automatically, and runs inside the same native boundary. There is no policy-editing tool, provider credential injection, or domain allowlist.

`pnpm test` includes native Linux enforcement tests and expects the pinned nono binary, with no skipped enforcement checks or unsandboxed fallback. Tests use temporary workspaces, a scripted model, and ephemeral loopback sockets; they never start or stop the user's development servers.

## Remote connections and conversations

Configure `CONSOLE_ACCESS_TOKEN` for remote access. Expose through HTTPS or forward loopback
through SSH. Register the URL/token explicitly in the web app's Machines page. The web server owns
its independent private connection registry; disconnect never stops or deletes this backend.
The backend's older hub routes remain for compatibility and are not used by the browser.
`GET/POST /sessions/:id/conversations` lists or creates conversations; creation takes `{ requestId, name? }`.
`PATCH /sessions/:id` renames the session; `PATCH /sessions/:id/conversations/:conversationId` renames
a conversation. Nested `/config`, `/sandbox`, `/messages`, `/cancel`, and `/resume` apply the existing
operations to that conversation. Model and sandbox defaults are inherited from Main at creation.
Conversations share the session's database and workspace, not their transcripts. Settings remain
conversation-specific. Resume starts Pi's scheduler for the whole session.

Integration tests run two disposable authenticated backends, exercise proxying, project/session/
conversation creation, transcript separation, credentials omission, and restart persistence. They
do not connect to personal remote machines or use paid inference.

A session bound to a project keeps that working directory across its conversations. Sandbox
settings can change permissions, but cannot silently move it to another project directory.

## Machine settings and project lifecycle

- `GET/PATCH /machine-settings`: persisted name, absolute default project directory, fixed/default
  model settings, remembered configuration, and runtime prerequisites. Updates do not move files.
- `PATCH /backends/:id`: rename a registered connection alias; the UI also updates this after
  renaming a remote machine. The local connection uses the machine's current name.
- `POST /workspaces`: register a directory or provide `repository` as a public HTTPS GitHub URL.
  An omitted path uses the configured project directory. Git clone is asynchronous; poll the
  returned project's `state` and use `POST /workspaces/:id/retry` after failure/interruption.
- `PATCH /workspaces/:id`: rename; `DELETE /workspaces/:id`: move to Trash.
- `GET /workspaces/trash`, `GET /sessions/trash`, and
  `GET /sessions/:id/conversations/trash`: list deleted records.
- `DELETE /sessions/:id` or `/sessions/:id/conversations/:conversationId`: move idle work to Trash.
  Append `/restore` and POST to restore projects, sessions, or conversations. Files/databases stay.
- `POST /sessions` accepts `access: none|read|edit|setup`; Setup requires a project and grants
  project writes, commands, and unrestricted network. Default is None.

Model defaults prefer project history, fixed machine default, then remembered machine settings.
Conversations inherit Main's configuration. See [architecture](../architecture.md#machine-and-project-lifecycle)
for clone boundaries, command isolation, timeout/output limits, cancellation, and retention.
Lifecycle tests cover restart persistence, cloning failure/retry, Trash/Restore, and an actual Pi
command-tool call running an offline pnpm install. Native tests cover filesystem/network denials
and command cancellation. Tests use scripted inference and disposable directories.

## Agent controls

- `GET/PUT /state`: machine-wide JSON and revision; PUT requires `{ value, revision }` and rejects
  stale writes with 409. The hub forwards this resource to the selected machine, including PUT.
- `GET /sessions/:id[/conversations/:conversationId]/inspect`: actual registry tools, schemas,
  replay modes, permitted/selected status, installed extensions, instructions, and active tasks.
- `PATCH .../agent`: select `{ tools: string[], instructions?: string }` while idle. Tool names
  outside saved grants are rejected; this cannot enable shell/network/filesystem authority.
- `POST .../fork`: `{ entryId, requestId }`; native history fork with idempotent creation.
- Session and conversation creation accept an optional nonblank name. Omit it for automatic
  `Session #N` or `Root #N`. Main remains the first conversation; names never change identity.

`runtime/coordination.ts` owns shared state storage and coordination tools. `subagent` creates a native
task-owned child with inherited grants and no recursive delegation. `agent-controls.test.ts` proves
numbering/idempotency, state conflicts/receipts, real state/delegation calls, fork history, ancestry,
and restart persistence. `hierarchy.test.ts` also verifies remote state stays on the selected machine.
Saving sandbox grants reapplies all currently permitted tools; tool toggles can narrow them afterward.

## Permanent deletion

`DELETE /sessions/:id/permanent`, `/sessions/:id/conversations/:conversationId/permanent`, and
`/workspaces/:id/permanent` operate only on Trash records. Live work blocks session maintenance.
A project must have no remaining sessions; its files are never erased. Session purge closes the
harness and removes only its owned databases. Main and delegated history require session purge.
Conversation purge rejects fork descendants and uses the pinned Pi storage adapter after closing
an idle harness. ID allocation history remains; deleted transcripts do not return on restart.
`purge.test.ts` verifies physical record/database removal, dependency protection, monotonic IDs,
legacy Main deletion, credential preservation, and untouched project files. Backups/shared state
are outside this deletion operation.

## Connection handshake and extension selection

`GET /v1/connection-info` uses the same authentication boundary as other machine APIs. It returns
`product: console`, `apiVersion: 1`, persistent machine ID/name, authentication mode, and capability
names. It never returns the token or provider credentials. Startup prints the local connection URL
and whether a token is required. A remote operator supplies the reachable HTTPS/tunnel address
and configured token. A loopback server with no configured token can be connected without one.

`PATCH /sessions/:id[/conversations/:conversationId]/extensions` accepts `{ name, enabled }` for
an installed Pi extension. Idle-only changes select the extension itself, including sections/hooks;
its offered tools remain within sandbox grants. Unknown extensions are rejected and child agents
inherit actual selections. No browser-supplied extension code is executed.

## Native Pi coding tools

`console.sandbox` registers Pi Durable's actual `read`, `write`, `edit`, and `bash` definitions.
Their implementations run in `sandbox/pi-tools.ts`, loaded inside the nono worker after restrictions apply.
Only the required installed package directories are added as read-only runtime prerequisites; the
worker receives no Harness document/task/model APIs or provider credentials. Console's older tool
names remain for saved histories. A restricted bridge bounds output and adapts shell execution to
keep descendants in the worker's process group for cancellation. Scratch output expires per call.

`access: project` grants project writes and commands with network blocked. UI conversation creation
uses this preset; API callers can still request None, Read, Edit, or explicit Setup. Existing policies
are not automatically widened. Reapplying an enabled policy selects newly installed permitted tools.
Prompt context includes the assigned project directory even when filesystem tools are disabled.
Native tests cover tool calls through Pi, edits, outside/private paths, symlinks, network denial,
clean environments and cancellation of delayed descendant writes. Resource quotas remain unimplemented.

## Runtime controls and inspection

`POST /sessions/:id[/conversations/:conversationId]/messages` accepts optional
`whenBusy: reject|steer|followUp`. Omission preserves the original reject behavior. Steers join
at a tool-round boundary; follow-ups start after the current run. Both use Pi's persisted inbox.
A reused request ID returns its original submission, regardless of retries. Interrupted work
rejects all new delivery modes until explicitly resumed or cancelled.

`DELETE .../submissions/:submissionId` withdraws a queued input in that conversation. An input
already placed in a run returns 409; use conversation cancellation to stop active work.
`POST .../compact` accepts `{ requestId, instructions? }`; an atomic Pi commit creates the native
compaction task, its live status, and a receipt in `console.compactions`. Retrying the same action,
including after restart, returns the original task. `POST .../reset` accepts `{ requestId, handoff? }`
and durably submits Pi's reset entry with its request ID. Both controls currently require idle
work and never implicitly resume an interrupted sibling conversation. Reset retains old history
and does not ask the model to answer until the next input.

Snapshots include queued input, Pi usage ledgers, context estimates/default compaction margins,
compaction progress, a sanitized failure flag, and available live tool status/output. Provider
exception strings remain private. Transcript projections include tool calls and context-entry kinds.
`GET .../inspect` also supplies session-wide task ownership, waits, sleep deadlines and blocked reasons,
without exposing task checkpoints or provider request payloads.

`test/runtime-controls.test.ts` covers steering/follow-up boundaries, deduplication and scoped
withdrawal, queued input across reopen, explicit recovery, long-history compaction, and reset/handoff.
See the [Console feature inventory](../features.md) for remaining implementation; runtime availability
alone does not establish a completed Console integration.

## Project Markdown resources

`GET /sessions/:id[/conversations/:conversationId]/resources` returns the current workspace's
instruction sources, skill index and prompt index. Resource reads execute inside nono using the
saved policy. Disabled filesystem access returns an empty disabled index. No parent above the
workspace, personal home, executable extension or MCP configuration is loaded implicitly.

At each model request, the sandbox extension includes the first applicable context file at the
workspace root in this order: AGENTS.override.md, AGENTS.md, AGENTS.MD, CLAUDE.md, CLAUDE.MD.
Project `.pi/SYSTEM.md` and `.pi/APPEND_SYSTEM.md` follow as prompt sections. They do not replace
Console's boundary instructions or the saved conversation instructions, which still render last.
`load_project_resource` with `kind: instructions` and a relative `directory` reads the applicable
root-to-directory chain before subdirectory work. Source directory scope stays explicit.

Skills are SKILL.md roots under `.pi/skills` and `.agents/skills`; `.pi` wins duplicate directory
names. Templates are Markdown files under `.pi/prompts`. Names use letters, numbers, underscores
and hyphens. Frontmatter is removed from invoked content; skill names come from directory names.
`/skill:name request` loads the skill before durable admission; `/prompt:name arguments` expands
its template. Parameters support $1, ${1}, $@ and ${@:start:count}; quoted arguments are preserved
as one value. Retrying an admitted request never reloads or duplicates its expansion.

Resources are re-read for model requests; Reload resources refreshes the browser index. File reads
are bounded to 32 KiB, discovery to 100 skills/templates and depth eight, with a 128 KiB index cap.
Symlink resource files/directories are skipped; requested instruction directories reject symlinks.
Permission and worker failures have no unconfined fallback. Existing conversations can reapply
sandbox policy to select the newly installed load_project_resource tool.

## Recorded plans and tool presentation metadata

History snapshots include toolCallId and isError on tool results so clients can pair parallel calls
with their actual result and expose failures. These are additive fields; transcript entries remain
owned by Pi. The web never needs to guess pairing by tool name or completion order.

The console.agent extension registers update_plan, a replay-safe tool accepting a title and up to
30 distinct steps with pending/in_progress/completed statuses. At most one step may be in progress.
Updates write the rewindable, conversation-scoped console.plan document through a Pi commit and
return the same structured state as a recorded tool result. Snapshot plan is absent until first use.
A source entry binds the plan to its recorded activity. Independent conversations do not inherit a
plan; native forks restore the plan as of the fork entry. Plan progress is an agent claim, not a check result.

New conversations select the plan tool with the other coordination tools. Existing selections remain
unchanged until the user enables it or reapplies their sandbox/tool selection. Tests cover durable
reopen, historical forks, isolation, validation, and preservation of the previous plan after invalid updates.
