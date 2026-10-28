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

- `src/app.ts` constructs the HTTP application without opening a port, making it directly testable.
- `src/main.ts` owns configuration, listening, logging, and process signals.
- `test/app.test.ts` exercises the HTTP surface without binding a network socket.

Node runs erasable TypeScript directly during development and tests. This does not check types;
run the separate type-check command. Production startup uses compiled JavaScript. Keep runtime
dependencies in this package's manifest, and review Biome fixes with the repository conventions.

The Pi integration remains in this package: `console.ts` wires routes, `providers.ts` relays Pi authentication, `credentials.ts` stores machine credentials, `sessions.ts` owns the session catalog, `session-routes.ts` validates session operations, and `conversation.ts` owns each harness. See [architecture](../architecture.md#first-pi-integration) for storage, request identity, and recovery semantics.

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
- `GET /sessions`: named sessions and their current status; unavailable databases are reported individually.
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

`agent-extension.ts` owns shared state storage and coordination tools. `subagent` creates a native
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
