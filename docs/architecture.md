# Architecture

The browser connects directly to the selected backend. Next.js serves the website and does not
proxy API requests or choose a backend on the user's behalf.

```text
Browser → Next.js (127.0.0.1:3001) → Home / Preferences categories
Browser → selected loopback backend → GET /v1/connection
```

## Ownership

| File | Responsibility |
| --- | --- |
| `packages/server/src/app.ts` | Fastify routes and explicit browser-origin/CORS policy. |
| `packages/server/src/main.ts` | Listen on loopback, native logging and graceful shutdown. |
| `packages/web/src/lib/connection.ts` | URL validation, bounded-duration fetch and response validation. |
| `packages/web/src/components/connection-provider.tsx` | Connection state, monitoring and cancellation. |
| `packages/web/src/components/settings/` | Browser bookmark management, add-device form and Appearance views. |
| `packages/web/src/components/layout/` | Expandable client/device column, resizable backend context panel, compact rails and shared actions. |
| `packages/web/src/components/devices/` | Browser-local device bookmark state. |
| `packages/web/src/lib/devices.ts` | Bookmark validation, URL normalization and duplicate rejection. |
| `packages/web/src/components/workspace/` | Device workspace, connection settings and conversation previews. |
| `packages/web/src/components/ui/` | CLI-installed shadcn Base UI components; no custom primitive library. |
| `packages/web/src/components/home.tsx` | Cross-device overview of saved bookmarks and current connection status. |
| `packages/web/src/app/layout.tsx` | Shared navigation and connection provider. |
| `packages/web/src/app/globals.css` | Preset tokens and Tailwind integration; shared radius scale and Geist typography. |

ConnectionProvider owns a ConnectionManager with independent lifetimes keyed by saved device ID.
DeviceProvider remembers successful connections by bookmark ID and rechecks all of them on reload.
Each connected client probes every five seconds with a five-second request timeout. Disconnect,
replacement, failure and unmount cancel only that client's requests/streams. Failed monitoring stops
until explicit reconnect. Route selection chooses the feature client without changing other lifetimes.

## Connection boundary

The client accepts HTTP or HTTPS origins on `localhost`, `127.0.0.1` and `[::1]`, with a port as
needed. Paths, query strings, fragments and embedded credentials are rejected. The default server
listens on IPv4 loopback; an IPv6 URL works only if the chosen backend actually listens there.
Fetch omits cookies, disables caching and refuses redirects. The response identifies the Console
protocol and persistent backend installation ID, not a cryptographically authenticated identity.

Fastify permits only `http://127.0.0.1:3001` and `http://localhost:3001` as browser origins.
Requests with other Origin headers are rejected; nonbrowser clients without Origin remain allowed.
There is no Console client authentication. Provider persistence is described below. Future API authentication belongs at the backend request
boundary; a website sign-in library alone would not protect Fastify. SSH would be a transport,
while the connection client remains the single browser request boundary.

The root `dev:server` and `dev:web` scripts are also separate Mise tasks. Node watch mode restarts
the backend on source edits; Next.js owns web hot reload. No custom launcher is installed.

## Frontend shell and saved devices

`AppShell` separates primary client navigation from a route-dependent context column and content.
`DeviceRail` owns the primary column: 256px expanded, 56px compact, with navigation-only device rows. Its width animates over 200ms with overflow clipped and reduced motion respected;
the toggle stays anchored. Home has no context column. Each device and Preferences is a distinct context; entering
one starts with the 56px compact context rail. Navigation within the same context preserves its state.

The desktop context uses shadcn Resizable (208–384px expanded, 256px initially) and preserves its
pixel width when the primary column resizes. Only explicit toggle actions update open state; separator interaction adjusts expanded width,
and ordinary container resizes cannot change open state. This avoids a resize
callback feeding layout changes back into navigation state. Dragging saves the expanded width. The compact separator is disabled for pointer/keyboard input
and loses its extended hit area. Expanded dragging cannot snap into the compact state: it remains
within 208–384px, and the toggle owns collapse. Imperative resize commands run on the next animation
frame after the library commits updated collapsible constraints.

The context's outer flex item animates its occupied width over 200ms, retracting its right edge
rather than translating the content. Home sets the collapsed size to zero; hidden navigation is
inert and excluded from accessibility. CSS targets the library's outer panel because its className
prop styles an inner element. The navigation panel explicitly sets inline overflow to hidden,
overriding the library's default overflow:auto so the width transition cannot flash a scrollbar.
The sidebar content owns normal vertical scrolling. Dragging disables transitions, and reduced motion skips animation.

Both chevron toggles retain their top-left anchor. The content pane has no shell toolbar. Mobile
keeps compact rails only when relevant and uses shadcn sheets for expanded navigation; switching
contexts closes the mobile context sheet. `SidebarAction` composes ghost Buttons with 16px icons.

Device rows show initials/name and status only. Clicking navigates without disclosure or connection
changes. Manage devices (`/devices`) owns Connect/Disconnect/Cancel, Edit, Forget, URL, checked time
and errors. Editing clears the bookmark's recorded backend identity and disconnects that client;
reconnecting verifies and accepts the new identity. Home shows only counts and workspace links.
Neither Home nor Manage devices has a backend context panel. Machine settings remain in the
backend context panel. `useDeviceStatus` shares per-bookmark labels across navigation and Home.

Navigation surfaces use client/context tokens, with content retaining the base background. The
client surface is lightest in dark mode; context is intermediate and content darkest. Column divider
borders and the visible resize line are removed while the expanded resize hit target remains active.
Selected device rows use a shaded background without an outline.
Disclosure state is not selection: tree triggers override the primitive's expanded background.

Standalone conversation previews use nested lists with dashed elbow connectors, including main conversations,
subagents and forks. The final sibling's vertical connector ends at its row center, while parent
branches continue only to siblings that actually exist. Conversation selection uses background
and aria-current. Remaining borders default to dashed strokes; focus rings and form-control focus colors retain their
accessibility styling. These are presentation rules, not new backend domain entities.

The rail lists all saved devices with initials, accessible names and status squares: green connected,
amber connecting, red connection failed, gray disconnected. These describe independent client
connections, not fleet uptime. The primary column selects Home, a machine, Manage devices or
Client preferences. Preferences currently contains Appearance only. Machine settings replaces the
project tree with Providers/Projects and Back to workspace; provider credentials remain backend-owned.

- `/`: saved/connected/error counts and device workspace links.
- `/devices`: device connection management.
- `/devices/new`: save a bookmark, then return to Manage devices.
- `/devices/[deviceId]`: selected device workspace.
- `/devices/[deviceId]/settings`: redirects to Providers.
- `/devices/[deviceId]/settings/providers`: provider authentication, models and favorites.
- `/settings`: redirects to `/settings/appearance`.
- `/settings/connections` and `/settings/connections/new`: redirect to the new management routes.
- `/settings/appearance`: client-owned System/Light/Dark theme.

The main content pane currently displays route content. A multi-pane workspace for conversations,
files and previews is a future increment; no window/docking framework is installed yet.

`ProjectTree` lists backend project registrations. Standalone sessions use a reserved owner in
the harness index and a private `sessions/workspaces/<sessionId>` working directory. They share
the Durable runtime and message APIs with project sessions. Project archival only touches sessions
owned by that project. Standalone history and workspace files persist across restart.

Connection implementation is isolated behind `BackendConnector.open` and `BackendClient` in
`packages/web/src/lib/backend/`. The local HTTP connector validates the loopback endpoint,
performs the handshake and owns fetch/EventSource creation. Its client supplies requests,
subscriptions, health probes and close. ConnectionManager owns one client per bookmark and closes only that client on
replacement, disconnect or failed health checks, and all clients on unmount. Client close aborts HTTP requests and
closes subscriptions immediately, including when the next client uses the same URL.
Feature hooks consume the client without constructing network connections.

A future connector can establish an SSH tunnel through a companion or resolve an HTTPS endpoint,
then return a client handling its credentials and stream authentication. The existing bookmark
format and URL policy currently support local HTTP only. Remote profile persistence, credential
storage, tunnel management and sign-in need their own implementation. EC2 and Kubernetes are
deployment locations that can expose the same HTTP endpoint through a gateway.

The server's `http/connection.ts` owns origin checks, CORS, health and handshake routes.
`createApp` accepts an HTTP connection policy, including an optional authorization hook applied
before feature handlers. CORS preflights complete before authorization. Deployment composition
chooses this policy and the listener address. Domain services and route handlers retain their
current contracts. The production entrypoint selects the existing local unauthenticated policy.

DeviceProvider sits inside ConnectionProvider. Browser storage `console.devices.v1` retains IDs,
display names, normalized loopback URLs and the last accepted backendId. `console.connected-devices.v2`
retains successful connection IDs; the previous single-ID key is read on migration. Failed new
connections are not remembered. Disconnect/Cancel/Edit/Forget remove only their ID. Corrupt lists
are reported without overwriting them. Cross-tab editing is not coordinated. `useBackendRequest`
resolves the route device's client; provider/project snapshots are guarded by actual client identity
to reject late results after navigation or reconnect. The manager rejects simultaneous connected
aliases with the same backendId and fails a health check if the endpoint's identity changes.

The backend handshake uses the existing private provider-store installation UUID. It survives process
restart but is not a host hardware identifier or authentication token. The production `main.ts` claims
`storage/instance-lock.ts` before opening services: an exclusive SQLite transaction in the fixed user
data directory. It remains held through service shutdown, releases on process death and rejects a
second entrypoint for the same OS user. The session-directory ownership lock remains in place.
This is not machine-global coordination across users, containers or separate data directories.
Programmatic test app instances remain available with isolated storage and ports.

`components.json` records `base-lyra`, Zinc and Lucide. The shared preset code is `bddBUJXM`;
Geist comes from `next/font`, and the theme uses a 10px base radius. `next-themes` owns
appearance with a system default. Tailwind/PostCSS and `shadcn/tailwind.css` supply styling.
The installed UI source is formatted to repository conventions, with small semantic/lint fixes;
the sidebar's unused cookie write is omitted. No global lint rules are disabled for generated code.

## Provider management

`packages/server/src/providers/store.ts` owns `~/.local/share/console/providers.sqlite` (directory
created with mode 0700, file 0600). Credentials are plaintext protected by filesystem permissions,
not encrypted or an OS keychain. SQLite transactions and a mutation queue serialize credential
updates, including Pi-owned token refresh; favorites, enabled state, installation identity and
dynamic catalog cache share this store. `modify` checks cancellation before committing. Reads of
provider metadata never return credential values. Earlier Console databases and Pi auth.json are untouched.

`service.ts` composes Pi AI 1.4.0's `Models`, `CredentialStore` and `ModelsStore`. Built-in factories
own provider login prompts and model catalogs. Console supplies a nonambient auth context: no env
credential lookup or automatic discovery of credential files. Some provider-owned login methods
can explicitly ask for backend-side profiles/paths; this is local, trusted configuration today.

`routes.ts` owns HTTP schema validation, cache prevention and sanitized errors. Sign-in is a
bounded backend operation: POST starts it, GET observes it, POST answers a prompt and DELETE
cancels it. Prompts/events are memory-only, expire after ten minutes, and terminal results remain
for sixty seconds. One active login per provider is allowed. Disconnect/remove cancels and waits
for pending login before changing storage, preventing a late login from restoring removed keys.
A per-provider update guard rejects overlapping login/configuration/catalog mutations while a
provider update is in progress, including a new login arriving during removal.
Backend shutdown aborts pending logins before closing storage. Restart requires restarting a pending
login; completed credentials/favorites persist. Durable project sessions and SSE are described below.

Configured/enabled status means credentials exist and are enabled, not that upstream access was
verified. Pi handles model availability filtering and thinking-level metadata. Explicit catalog
refresh invokes only that provider's refresh implementation; static catalogs are no-ops. Cached
dynamic catalogs are restored by the provider refresh path; a restart may require Refresh catalog
before dynamic-only favorites become available. Disabling retains favorites; removing clears local
configuration/cache. Neither action revokes an upstream OAuth grant. Future execution must enforce
enabled state and use the same filtered favorites boundary; catalog presence alone grants no access.

`packages/web/src/components/providers/` owns backend-scoped metadata, settings
and sign-in dialogs. The connection origin scopes requests and state; switching/disconnecting aborts
obsolete requests. Overview refreshes use a sequence guard; stale responses cannot overwrite newer
mutation results. Login polling runs sequentially; secret input is scoped to the current prompt and
never written to browser storage. The page lists provider methods, searches models and stars favorites;
`GET /v1/models/favorites` supplies the composer model picker; supported thinking levels follow the selected model. Choices apply at message admission while idle.

The implementation follows [Pi Pocket's provider flow](https://github.com/TannerMidd/pi-pocket/blob/db1e531d492f9ce231ba7a9761c52c0ebc7becc0/src/server/providers.ts)
and [Pi AI's provider/auth API](https://github.com/earendil-works/pi/tree/main/packages/ai). Unlike
Pi Pocket, Console owns a separate credential store rather than sharing Pi's auth.json.
A pnpm patch adds missing JSON import attributes to Pi AI's published declaration files, preserving
strict NodeNext checks. The Google SDK's optional MCP type peer is a development dependency;
no MCP capability is exposed. Reviewed Google/protobuf lifecycle scripts are explicitly approved.

Provider settings use shadcn Scroll Area for both catalogs. On desktop, each list fills the
remaining content-pane height and scrolls independently; smaller screens stack the catalogs.
Model rows are contiguous and borderless. Search fields use shaded backgrounds
without borders, retaining keyboard focus indicators.

Catalog scrollbars hide when idle and appear on hover or keyboard focus. The provider list
reserves extra right padding so model counts remain clear of the scrollbar.

Starred models sort first within the selected provider, preserving catalog order within each group.
Expanded details align with the model name and group prominent token limits, capabilities and
secondary catalog pricing (input/output/cache read/cache write). Model rows have no separators.

The desktop provider catalog is 320px wide. Provider and model names share the same text size
and weight; metadata remains secondary.

Workspace navigation separates Projects from Recents. New conversation creates one standalone
Durable session on the connected machine and opens its chat immediately. Recents lists those
conversations newest first. Project rows expand in place and their context menu opens settings.

The workspace New conversation action aligns vertically with Home in the primary column.
Collapsed workspace navigation exposes direct project and conversation shortcuts; only the top
chevron expands the panel. The footer uses the label Machine settings.

## Projects

`packages/server/src/projects/` separates SQLite registration storage, directory validation and HTTP routes.
The registry is `~/.local/share/console/projects.sqlite`; `storage/database.ts` gives both project and
provider databases private permissions and a busy timeout. Project records contain UUID, name, canonical
absolute path and creation time. A unique path constraint arbitrates concurrent registration requests.
Directory checks use realpath/stat/access (read/write/traverse); they are a snapshot, not a filesystem
sandbox or a guarantee that later execution will succeed. No writes occur inside a project directory.

GET `/v1/projects` lists registrations; POST registers `{name,path}`; GET `/v1/projects/:id` opens
metadata; DELETE archives the registration and its sessions. List/open recheck availability, retaining unavailable
registrations. Unknown body fields fail validation. PUT `/v1/projects/:id` updates a display name, preset icon and color without changing the path or files. No directory browsing or project file/tool execution is exposed; text sessions are described below. New/clone setup is described below. API access retains the existing local-only boundary.

The frontend's `hooks/use-backend-request.ts` owns bounded, uncached requests and cancellation on
connection change, shared by providers and projects. `components/projects/projects-provider.tsx`
scopes project lists to the active origin and rejects stale refreshes; ten-second polling observes
other clients. `project-page.tsx` owns project harness navigation and dedicated editor/check/remove views. Expanded and
compact workspace navigation list the same real projects. Routes are
`/devices/[deviceId]/projects/new` and `/devices/[deviceId]/projects/[projectId]`. Opening a bookmark
never connects automatically. The registration form cannot operate against a different selected machine.

## Managed project setup

Machine defaults use `machine_settings` in projects.sqlite, initially resolving the backend home
plus Projects. GET/PUT `/v1/machine/settings` read/save `projectsRoot`; saving a missing path does
not create it. Existing registrations retain their paths. POST `/v1/projects/create` accepts
`{name,folder,createParents}`; POST `/v1/projects/clone` additionally accepts `repository`.

`projects/setup.ts` validates one portable folder segment, checks the captured root, optionally
creates missing parents and rejects registered/existing destinations. Work is prepared inside a
unique hidden staging directory under that root. A nonrecursive mkdir exclusively reserves the
final name before rename publishes the result; a competing request cannot overwrite an existing
folder. Failure removes only staging and an empty reservation. Published files are never recursively
deleted. Registration failure after publication leaves files for Existing directory to recover.
Directory checks are snapshots, not a filesystem security boundary against a hostile local operator.

`projects/git.ts` spawns Git using argument arrays (no shell), with a minimal environment, global
and system configuration disabled, no credential helper/prompts, empty templates, disabled hooks,
HTTPS-only transport, no redirects and no recursive submodules. Git is an external runtime dependency.
New repositories use main and have no initial commit. Clone URLs cannot contain credentials/query/
fragments; private login, SSH and pull/update are deferred. On Linux cancellation kills the Git
process group, including transport children. Windows descendant cancellation has not been verified.

The service caps setup at two concurrent operations, times out after two minutes and aborts pending
operations during close. HTTP disconnect cancels its operation; the client has a slightly longer
request deadline and Cancel setup. This is bounded HTTP work, not a durable job: process crashes can
leave hidden `.console-setup-*` staging directories; no automatic deletion or resume is implemented.

`project-setup.tsx` owns the three-mode shadcn Tabs form, derived names, destination summary and parent
creation checkbox. `project-settings.tsx` owns the machine projects-root form. No browser filesystem
picker is used: these are paths on the connected backend. Public Git behavior follows the official
[clone](https://git-scm.com/docs/git-clone) and [init](https://git-scm.com/docs/git-init) documentation.

Project appearance is backend-owned. SQLite adds icon/color columns transactionally to existing registries, with folder/neutral defaults. Expanded project rows use shadcn Collapsible; their context menu opens settings or archival and supports browser-local pinning. `/devices/[deviceId]/projects/[projectId]/settings` hosts the editor. Polling updates names and appearance across clients without replacing unsaved editor drafts.

## Project Git inspection

GET `/v1/projects/:id/git` resolves the registered project and rechecks its directory. `projects/git-metadata.ts` runs read-only Git commands with argument arrays, isolated global/system configuration, no optional locks, a five-second timeout and 1 MiB output limit per command. Responses distinguish repository, non-repository and unavailable/error states; command stderr is not exposed. Local refs use `for-each-ref`; worktrees use the stable NUL-delimited porcelain format, preserving paths containing newlines. No network operation or history traversal is performed.

`project-git.tsx` owns the on-demand Git view and aborts stale client requests on unmount/origin changes. Refresh rechecks directory and Git metadata; ordinary project polling does not spawn Git processes. Worktree discovery is read-only and does not establish execution isolation. Each inspection consists of multiple commands and is a best-effort snapshot if Git changes concurrently.

The project editor uses full-width responsive layout and top-right archive confirmation. Its icon picker renders 32 Lucide presets; the project update schema accepts the same IDs. Git inspection behavior remains on demand; reorganizing the view does not add Git actions or polling.

Project identity and directory metadata use container-responsive columns so their layout follows the available content pane. Current Git rows use accessible current-state attributes and blue square markers. The first Git worktree-list record is the main worktree (or bare repository); linked records use their directory basename as display identity. Branch names remain in the API snapshot but are omitted from the compact worktree UI. The red Archive action preserves the project directory.

The editor tracks the last successfully saved name/icon/color separately from its draft. Its conditional header Save button targets the identity form and hides on revert or successful save. The project-title refresh icon reads directory and Git data; the Git view reports loading to keep that control disabled until completion. Main is the display label for the original checkout; active worktrees and branches share row highlighting.

`project-context-menu.tsx` wraps both project navigation modes in the library context menu. `project-removal-dialog.tsx` owns the shared archive workflow used by the menu and editor. ProjectsProvider owns validated browser-local pin preferences, scoped by backend URL; `lib/project-pins.ts` validates persistence and orders known projects without mutating backend snapshots. No pin field or API is added to the backend.

Project context-menu triggers use a flex-column formatting context. This stretches expanded disclosure rows to the available width. SidebarAction now uses flex display so compact automatic margins also work in ordinary block wrappers.

## Durable sessions

```text
Machine
└─ Project
   ├─ Session 1 (default; one Durable Harness / SQLite session)
   │  ├─ Main
   │  └─ Conversation 2, Conversation 3, …
   └─ Session 2, Session 3, …

Browser -- HTTP commands --> HarnessService --> Durable commits --> session SQLite
Browser <-- SSE snapshots -- conversation watch <-- committed state
```

A Durable Harness opens one Session. The implementation retains that one-to-one ownership;
the public API and UI expose sessions, without a second harness navigation level. Projects get
Session 1 and Main on registration/setup, even without any configured provider. Startup backfills
missing defaults for existing projects without replacing existing conversations or session IDs.

| Source | Owns |
| --- | --- |
| `server/src/harnesses/store.ts` | Internal harness/session index; transactionally allocated project session numbers. |
| `server/src/harnesses/runtime.ts` | Single-flight open, process ownership lock, private session files, enabled-provider model gate, registry and shutdown. |
| `server/src/harnesses/documents.ts` | Conversation labels, latest admission reference and session-wide conversation naming counter. |
| `server/src/harnesses/service.ts` | Default sessions, numbering, project/model/thinking checks, lifecycle, deduplication and session-wide Stop API. |
| `server/src/harnesses/view.ts` | Explicit text and bounded project-tool client projection; no credentials, raw system prompts or provider errors. |
| `server/src/harnesses/routes.ts` | Validated session HTTP commands/history and bounded SSE delivery. |
| `web/src/components/sessions/use-project-sessions.ts` | Backend-scoped project session snapshots and refresh notifications. |
| `web/src/components/sessions/project-sessions.tsx` | Session/conversation disclosures, context menu and immediate conversation creation. |
| `web/src/components/sessions/chat-composer.tsx` | Integrated textarea, model/thinking selectors and square arrow submit control. |
| `web/src/components/sessions/use-chat-models.ts` | Favorite catalog and model-specific thinking choices. |
| `web/src/components/sessions/conversation-page.tsx` | Transcript, delivery state, history and conditional jump-to-latest. |

Paths in this table are relative to `packages/`. Pi Durable, Pi AI and Chord are pinned to
1.4.0. The installed source/README governs this integration: newer upstream documentation has
a different watch signature and a windowed view that 1.4 does not provide.

Each session lives in `~/.local/share/console/sessions/<sessionId>.sqlite`; Durable owns its
conversation, entry, task, document and submission tables. Console never writes those tables.
The file is created mode 0600 inside a private directory. A separate SQLite exclusive transaction
on `sessions/owner.sqlite` holds process ownership of the entire session directory, releases on
process death, and rejects a competing runtime. This is local process coordination, not a distributed
lease. SQLite's power-loss guarantees remain those of Durable's WAL/synchronous configuration.

The Console index commits before opening the new session. Its session identity and optional legacy model reference let startup
repair an interrupted first-root initialization using idempotent `root()`. An initialization failure
can therefore leave an indexed, recoverable harness; creation retries do not have request deduplication.
Message submissions do: a client supplies a UUID `requestId`, reused on retry. Existing admission is
returned before current model eligibility is checked. Latest-submission metadata follows admission before acknowledgement; retry repairs a reference interrupted between those commits. Acknowledgement means stored, not finished.

Startup claims ownership, opens available projects' sessions, restores Main if necessary and resumes
each session scheduler before listening. Missing project directories skip automatic recovery;
read-only history remains accessible, but new input requires an available directory. Restoring a
missing directory requires a later backend restart or new admitted input to restart its work.
Closing/reloading/disconnecting the browser only closes watches and HTTP waits. Admitted generation
continues. Graceful backend close stops runtime invocations and closes session storage before project
and provider databases. Abrupt recovery follows Durable's model retry/checkpoint semantics; a model
request may be billed again. No claim of exactly-once external effects is made.

Submit and Stop are serialized per session. Stop aborts all conversations' ordinary work, withdraws
queued inputs and waits for it to settle. Its API/UI is deliberately session-scoped: `resume()` and
progress-requesting Durable calls enable the shared scheduler. No conversation-scoped Resume or
isolated scheduler promise exists. The API remains available, but chat does not expose a Stop session control. Durable reports log only event type and session ID, omitting raw
provider errors and credentials. A failed storage instance is removed from the manager after it closes;
a later access can reopen it, but automatic in-process failure recovery is not implemented.

Creating a session/conversation does not require a model. The composer selects an enabled available favorite model and only that model's supported thinking levels. Message admission rechecks both before changing the stored agent and admitting input. Model/thinking changes are rejected while ordinary work or queued input exists. Unstarring hides/disallows new submissions to that selection; already admitted work
is retained. The runtime rechecks provider enabled state when resolving models for new phases; it
does not retract an upstream request already in flight. Read-only project tools use the execution interface described below. There are no write/process tools or OS sandbox. Storing `cwd` is a workspace assignment, not confinement.

SSE sends a complete current snapshot, then complete snapshots from a Durable conversation watch; its metadata watch also notifies clients when the latest admission reference changes; reconnection
replaces the baseline instead of replaying missed events. The projection sends the newest 50 active
entries and text partials, busy/inbox counts and model identity. After an idle snapshot the client reads latest submission status separately, surfacing unanswered inputs even when no assistant entry exists. Submission responses omit raw diagnostic detail/trace and whitelist reason codes. Older history is paged through an
opaque cursor, 50 entries at a time. The installed Durable view itself still mounts the active
transcript; limiting the network projection does not bound that library's memory use. There are 32
stream slots, a 2 MiB frame limit, a five-second slow-consumer deadline and 15-second heartbeats.
Disconnecting a slow consumer stops only observation. Oversized snapshots cannot be streamed and
require a future incremental projection. No scale claim is made.

Client state is scoped by backend/project/session/conversation. Unacknowledged text/request IDs are
kept in sessionStorage for explicit Retry, then cleared on admission; this is browser-tab delivery
state, not a second authoritative transcript. The text UI shows the recent snapshot, explicit Load
earlier and Latest controls; automatic gap filling, Markdown, attachments and rich activity logs
remain future work. Session lists poll every ten seconds and refresh after local creation. Listings
currently expose the first 200 conversations and report truncation; full listing pagination is deferred.

Archiving gates new project mutations and session commands while the backend drains in-flight
commands and inspects every harness. Active or queued work requires explicit Stop all and archive.
Durable withdraws queued inputs and interrupts running conversations. If work fails to settle,
the project stays active. After sessions close, one registry update hides the project and its
sessions. The stored path remains reserved and the Durable databases stay in place. Startup skips
archived projects. Restore clears the archive timestamp and retains project and session IDs.
Project triggers, permanent deletion, forks and subagents are deferred.

Session numbers use a unique `(projectId, number)` index and `BEGIN IMMEDIATE` allocation. The first
number is 1; later numbers increase monotonically. Existing index rows gain numbers in creation/ID
order and display names become Session N; UUIDs and transcript files are preserved. Root is Main.
Additional conversations use a Durable session document counter, incremented atomically with creation,
starting at Conversation 2. They inherit Main's stored agent choices when present.

Project right-click → New session creates a session and opens Main without a dialog. Session
right-click → New conversation and its plus create/open a numbered conversation immediately.
The public creation bodies are `{}`. Existing transcript data is not renamed or recreated.

The composer sends the selected model/thinking choices with each new input; model changes reset
the selected thinking choice to a valid level for the new model. Only supported levels appear,
and non-reasoning models have no thinking selector. Preferences apply on message admission and
are then persisted in the conversation's agent document. Retried delivery retains its original
model/thinking payload and request ID. Idle Live/Stop session labels are absent; disconnection
and failures still surface. The transcript uses the shared Scroll Area, with Jump to latest shown
only when more than 64 pixels above the bottom. ResizeObserver tracks transcript/viewport changes.
The square arrow submits; Enter sends and Shift+Enter inserts a newline. Attachments and slash
commands are not implemented and have no placeholder controls.

## Project inspection execution boundary

Durable remains in the trusted backend and owns transcripts, checkpoints and tool results. Project
sessions install `console.project-inspection` when their Harness opens, including existing sessions
on reopen. Standalone sessions retain ordinary chat with no project tools. A per-request section
supplies current project ID/name/directory from the host registry, not model arguments. Project
content is untrusted data; the prompt asks the model to inspect files and cite paths/line numbers.

`harnesses/project-inspection.ts` defines tool schemas and replay-safe read operations.
`execution/types.ts` defines the injectable ProjectExecutor contract and host-owned project scope.
`execution/local.ts` performs all inspection I/O. A later sandbox worker can implement that contract;
no worker, shell, writes or permission-approval mechanism is delivered here. The local adapter runs
with the backend account's authority and reports isolation `none`. Canonical path checks reject
traversal and external symlinks, but are not kernel isolation or race-proof confinement against
concurrently replaced paths. Any readable file inside the project can enter the model context.

Listing returns at most 200 immediate entries. Text reads scan at most 256 KiB, use 1-based line
offset/limit (up to 200 lines) and return at most 16,000 characters. Search is literal/case-sensitive:
at most 1,000 visited entries, approximately 4 MiB read and 100 matches; it skips symlinks, binary
files and common generated/dependency folders. Truncation/skips are explicit. Each operation checks
cancellation and a five-second cooperative deadline between filesystem calls; an outstanding OS
filesystem call is not forcibly interrupted. Regular-file validation avoids reading devices/FIFOs.
Failures distinguish missing paths, OS permission denial, outside-project requests and generic errors.

Durable persists calls/results in its existing transcript. Read operations are replay-safe: unfinished
reads may rerun after a crash and observe changed files; committed results remain stored evidence.
`harnesses/view.ts` exposes only the known inspection tool names, calls, bounded result previews,
failures and active names. It never exposes raw system sections or arbitrary tool diagnostics.
`web/.../sessions/tool-activity.tsx` uses the shared shadcn Collapsible for calls/results in chat;
SSE reconnect and paged history use the same projection. No additional file-browsing HTTP API exists.

## Navigation presentation and conversation labels

The project/session/conversation ownership model is unchanged. A single session is flattened in
navigation; multiple sessions render grouped headings. Project compose resolves Session 1; group
compose targets that session explicitly. New session refreshes navigation without changing selection.
Shared navigation rows and menus keep compose/menu buttons inside the same hover surface.

Conversation Rename commits only Durable ConversationInfo.name through the session-serialized
service and existing project archive gate. PUT accepts a nonblank name of at most 120 characters.
Standalone list/detail derive their label from root conversation metadata and expose its actual ID.
IDs, transcripts and submission records remain unchanged. Conversation pins live separately in
console.conversation-pins.v1, keyed by backend URL and session UUID plus conversation ID.
They are browser preferences, not backend state, with no cross-tab synchronization.
Metadata refresh keeps the active chat mounted so renaming/group updates preserve unsent drafts.

Shared library components use token-driven rounded corners: controls and navigation rows use md,
menu items sm, popup shells lg and the composer xl. Structural column edges stay flush.
Custom navigation rows round their shared hover/selected surface, including action buttons. Rows have vertical clearance; focus keeps its keyboard ring
without persistently shading the parent. Row action buttons are 24px with 14px icons;
this preserves the existing disclosure, selection, compact alignment and resize behavior.

Scroll Area thumbs and native WebKit overflow thumbs are rounded and inset. Native scrollbars
in other engines use their thin, theme-colored platform rendering. Remaining square rules are
intentional seams in joined toggle controls, transparent input-group internals and line-style tabs.

SidebarAction uses flex display rather than inline-flex: compact auto margins center links in block
wrappers and full-width rows have no baseline slack. Both header anchors span the 56px rail.
Conversation controls use 28px height with 2px row spacing; projects use 32px headings. Action
visibility uses hover, :focus-visible and menu-open state rather than :focus-within, so mouse
focus cannot latch controls visible after the pointer leaves. Touch retains visible actions.

Workspace project rows have no persistent selection background or disclosure chevron. The project
icon/name is still a keyboard-accessible CollapsibleTrigger with aria-expanded. Only the active
conversation receives persistent selection styling. Expanded project/Recents conversations omit
the leading chat icon, keeping indented text labels; compact conversation shortcuts retain icons.

Project disclosure animation is scoped to .project-disclosure rather than changing every shared
Collapsible. Base UI supplies measured --collapsible-panel-height and starting/ending attributes,
and retains closing content until transitions finish. Height transitions for 180ms and opacity for
140ms; spacing belongs to an inner wrapper so closed height reaches zero. The settled open panel
returns to auto height for async list updates. Reduced-motion users receive immediate disclosure.
