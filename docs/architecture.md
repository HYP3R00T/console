# Console architecture

Status: local provider configuration and multiple Pi Durable sessions are implemented. Opt-in sandboxed file/HTTP tools are implemented; registered backend connections and independent Pi conversations are implemented. Opt-in sandboxed commands, public repository cloning, persistent machine settings, and recoverable deletion are implemented. Native forks, task-owned subagents, and runtime inspection are implemented.

[Requirements](requirements.md) owns product outcomes and scope. This document owns responsibilities,
state, interfaces, and technical tradeoffs. It must distinguish intended design from verified implementation.

## Intended system boundary

Begin with one backend on the machine containing the project workspace and a browser client.
The backend owns execution and saved state. The browser is a view and control surface, not the
owner of the running agent. This separation supports REQ-1 through REQ-5.

The current browser app is served by Next.js. Its health request is forwarded to Fastify
through a Next.js rewrite. These are two local Node.js processes; `mise run dev` starts
both directly on the host. The Next.js process does not own agent execution or persistent sessions.

```mermaid
flowchart LR
    User[User] --> Web[Web client]
    subgraph Host[Selected execution machine]
        API[Backend API and progress stream]
        Sessions[Session and run management]
        Runtime[Agent runtime adapter]
        Tools[Scoped tool execution]
        Store[(Persistent state)]
        Workspace[Project workspace]
        API -->|commands| Sessions
        Sessions -->|start and control runs| Runtime
        Runtime -->|tool requests| Tools
        Tools -->|authorized file and command operations| Workspace
        Sessions -->|identity and lifecycle records| Store
        Runtime -->|conversation and recovery state| Store
    end
    Web -->|commands and subscriptions| API
    API -->|snapshots and progress| Web
    Runtime <-->|inference requests and responses| Provider[Configured model provider]
```

The machine boundary shows where work and storage belong; it does not require separate services
for each box. The first backend can be one process. Model inference may be remote even when the
backend runs locally; relevant task content and tool results may be sent to that provider.

## Component responsibilities

- **Web client:** workspace/session navigation, task input, progress, errors, and explicit controls.
  It reconnects using stable identities rather than recreating work.
- **Backend API:** validate client requests, expose saved state, and deliver progress. HTTP and an
  event stream are the proposed interface shape; exact routes, payloads, and transport are unresolved.
- **Session/run management:** create identities, bind sessions to approved workspaces, track run
  lifecycle, coordinate limits, and distinguish terminal results from client connectivity.
- **Runtime adapter:** integrate the selected harness without exposing its storage internals to
  clients. Map its events, controls, and recovery behavior into Console's documented contracts.
- **Tool execution:** operate in the selected workspace under configured authority. Concurrent
  code-writing tasks need separate checkouts; a conversation fork is not filesystem isolation.
- **Persistent state:** retain Console metadata and required runtime state. These may be separate
  stores owned by Console and the harness; no shared database schema has been chosen.

## Logical data model

- A backend identifies an execution machine and its capabilities.
- A workspace associates that backend with an approved project directory.
- A session has a stable identity, readable name, workspace, and conversations.
- A conversation retains messages and tool interactions; native forks record history ancestry and delegated children retain task ownership.
- A run records an assignment, lifecycle, applicable limits, result, and verification references.
- Later approval records bind a decision to an exact action or artifact, not a reusable blanket permission.

Names aid navigation; stable identities support reopening and request correlation. Entity boundaries,
schemas, event ordering, retention, and compatibility must be settled before implementing their APIs.

## Main flow

1. The client selects a backend and existing workspace and requests a named session.
2. The backend validates the workspace, creates stable identities, and establishes persistent state.
3. A submitted assignment starts a bounded run through the runtime adapter.
4. Runtime and tool activity are recorded and exposed to the client.
5. Disconnecting removes the client connection, not ownership of the run. Reconnection retrieves a
   saved snapshot and the required subsequent activity without resubmitting the assignment.
6. Completion leaves the session available. Cancellation and later archiving/deletion use distinct operations.

Request identity and progress catch-up semantics require explicit design before concurrent clients
or retrying submissions are supported. Do not infer exactly-once execution from this flow.

## Recovery and ownership rules

- A backend process must own a run's execution; multiple clients must not become competing runners.
- Backend restart can recover work only if the selected runtime supports the agreed recovery contract
  and required storage is available. Session history alone does not establish execution recovery.
- Explicit cancellation must survive recovery. An uncertain external effect needs reconciliation or
  an operation identity before a retry can be considered safe.
- Store persistent state and required workspace files independently of disposable runtime instances.
- A worktree isolates source changes, not credentials, network access, ports, or shared databases.
- Client requests, issue text, and tool output do not grant additional execution permissions.

These are intended constraints requiring implementation and proof, not currently enforced guarantees.

## Technology and layout candidates

- **Node.js foundation (configured):** mise provides Node.js (`lts`), pnpm (`latest`), and Biome (`latest`);
  `pnpm-workspace.yaml` discovers packages under `packages/*`. The private root package exposes shared check commands.
  Biome checks JavaScript, TypeScript, JSON, CSS, and GraphQL through pnpm, prek, and CI; RumDL handles Markdown.
  The server uses TypeScript and Fastify in one Node.js process. Its health endpoint, build, type checks,
  and HTTP tests are implemented; see the [server guide](packages/server.md).
- **Web foundation (configured):** Next.js App Router, React, TypeScript, Tailwind CSS, and shadcn/ui provide the browser
  starter. It checks the Fastify health endpoint through a web-origin proxy; see the [web guide](packages/web.md).
  The conversation dashboard and provider settings are implemented; Console user authentication and shared-session controls are not.
  shadcn preset `bddBUJXM` supplies the initial theme, Geist font, and Lucide icon choice.
- **Pi Durable (integrated):** pinned to 1.4.0 for isolated session conversations with opt-in sandboxed tools. Provider authentication and model access use Pi AI. See the integration section below for tested and outstanding behavior.
- **SQLite (integrated):** separate databases hold Console credentials, the session catalog, and per-session Pi-owned conversation state. The first version has no backup or retention workflow; ownership and restart behavior are described below.
- **Monorepo:** `packages/server/` is a private workspace package containing the HTTP server scaffold.
  `packages/web/` is a private Next.js workspace package. These boundaries do not require
  independent microservice deployments.
- **Remote hosting:** a Kubernetes machine was discussed as a later host. It is not required for
  the first local workflow. A central hub, extra clients, and an automation scheduler are not initial components.

Entries marked configured or created describe the repository foundation. Remaining candidates should
not be treated as approved implementation choices solely because they appear here.
The video's Google Cloud, FastAPI, ADK, PostgreSQL, and model choices belong to its example, not Console.

## Developing Console versus Console's runtime

The existing user-level refine-issue and issue-to-pr skills support development of this repository.
They are not shipped Console features and are not required external context sources for understanding
these documents. GitHub issues/PRs track delivery; source and these documents retain durable knowledge.

Future issue, schedule, or event triggers would dispatch through the backend's existing assignment
path. Trigger configuration, deduplication, authority, and approvals need their own concrete designs.

## Implementation evidence and maintenance

Start by selecting one local end-to-end proof from [requirements](requirements.md#acceptance-scenarios-to-refine-into-issues).
Verify the chosen model access and runtime behavior before expanding the product.

Update this document when a change affects ownership, interfaces, storage, lifecycle, or deployment.
Record what is implemented separately from intended design, and replace candidates with the actual
decision and its reasoning when agreed. Keep feature tasks and verification results in their issues/PRs.

## First Pi integration

The [integration decision](decisions/0001-local-pi-integration.md) records provider boundaries. The [session decision](decisions/0002-session-owned-harnesses.md) records isolation, configuration, and preservation of existing data.

- Next.js owns the browser application and the independent machine registry/proxy. `/api/machines` manages explicit connections; `/api/machines/:id/api/*` forwards allowlisted requests with server-held credentials. Nothing enrolls or selects a local backend automatically. The prior backend hub API remains for compatibility, but the web client does not use it. Machine identity/settings remain on each Fastify backend; see the connection section below.
- `src/console.ts` registers validated routes, closes resources, and rejects browser mutations without the Console request header. No CORS or Console user authentication is configured. This is for private loopback use only.
- `src/providers.ts` adapts Pi's built-in catalog, login prompts, notifications, cancellation, logout, and explicit model-catalog refresh. Environment-only providers show setup guidance. Provider discovery does not prove access to a model.
- `src/credentials.ts` supplies Pi's credential-store interface. Credentials and installation identity live in `credentials.sqlite`; Pi owns login and token refresh. An exclusive SQLite lock prevents two backend processes from rotating the same credentials.
- `src/sessions.ts` owns a SQLite catalog and one cached harness per session. New sessions store Pi state under `sessions/<uuid>/conversation.sqlite`; an existing root `conversation.sqlite` is registered as the `default` session without moving it. A session that cannot open is listed as unavailable while other sessions remain usable.
- `src/conversation.ts` owns each harness and root conversation. The sandbox extension is registered, with tools disabled until explicitly configured. Configuration, submission, cancellation, and resume are serialized within each session. Conversations run independently; each conversation can accept steering and queued follow-ups during its run.
- `src/session-routes.ts` exposes session creation, snapshots, saved configuration, and lifecycle commands. Creation request IDs deduplicate retries; message request IDs are scoped to their session.
- Provider responses include supported thinking levels from Pi's `getSupportedThinkingLevels()` and model context capacity. Saving settings validates the selected model/level against the installed catalog and persists them in Pi's `pi.agent` document. Settings changes during unfinished work return 409. Messages use saved settings instead of carrying a second configuration.
- Browser polling retrieves the latest 50 transcript entries, committed partial text, and lifecycle state. The browser never owns the run. Session list polling runs every two seconds; selected transcript polling runs every second. A URL query remembers selection on reload, and in-memory drafts and uncertain submission IDs remain separate per conversation while the page is open. Repeated submissions with the same request ID return the original admission, including after restart. A request ID identifies its original input and must not be reused for different content or delivery mode.
- Closing the browser leaves execution running. Backend restart opens saved work without scheduling it; Resume explicitly enables scheduling. Cancel aborts the conversation and persists that outcome. Read/list tools may replay; file writes and HTTP GET do not replay automatically after interruption. Other external-effect workflows remain unimplemented.

Storage defaults to `$XDG_DATA_HOME/console` or `~/.local/share/console`. `CONSOLE_DATA_DIR` overrides it. The directory is owner-only and saved credentials are plaintext SQLite with owner-only permissions, not an encrypted vault. Keep it outside source control and run one backend per data directory. No automatic retention, export, or backup mechanism exists yet. Login attempts are ephemeral, expire after ten minutes, and can be reattached after a page reload while the backend remains alive.

Pi packages are pinned to 1.4.0. A pnpm patch adds missing JSON import attributes to Pi AI's published declarations, preserving strict NodeNext checking. A package extension supplies the MCP SDK referenced by Google's published declarations. Reviewed Google/protobuf lifecycle scripts are explicitly disabled; neither is required for these installed SDKs to run. Revisit these workarounds on upgrades.

## Configurable tool sandbox

[Decision 0003](decisions/0003-configurable-nono-workers.md) records the process boundary and the CLI choice. Pi retains execution state and model access in Fastify. Tool execution crosses into a fresh `nono wrap` worker for each call.

- `sandbox-policy.ts` defines the saved `console.sandbox` Pi document and validates directory grants. Defaults disable tools, allow no writes, and block network. Enabling requires an existing absolute workspace, which becomes readable. Additional readable and writable directories are explicit; writable grants include reads.
- `sandbox-tools.ts` registers `read_file`/`list_directory`, optional `write_file`/`create_directory`, and optional `fetch_url`. It reads the saved policy and revalidates grants for every invocation. The model cannot change policy through these tools. `run_command` is offered only when the saved policy explicitly enables commands.
- `sandbox-runner.ts` creates a nono capability manifest inside Console's protected data directory. It supplies a minimal environment, no provider secrets, and fixed read-only prerequisites for Node, the worker/package metadata, system libraries, OpenSSL configuration, and required device files. It executes nono 0.80.0 directly without a shell or inherited profiles.
- `sandbox-worker.ts` runs only after nono installs restrictions and execs Node, so Node's worker threads inherit them. File/HTTP calls have a ten-second deadline and bounded input/output; command limits are described below; text files and HTTP bodies are limited to 64 KiB. Unknown operations/arguments cannot be selected by the model.
- Policies cannot grant Console's private storage or its environment file. Writable grants also exclude the running Console source and Node/nono executable paths. This prevents a tool from rewriting its policy, backend, or launcher. Readable/writable roots are additive; overlapping broad parents are rejected rather than pretending to carve private children out on Linux.
- Policy updates require an idle session, validate paths, and run a restricted startup check before saving an enabled policy. They commit policy and offered tools together. Disabling remains possible even if an old workspace no longer exists. Existing policies are never replaced after a failed activation, and tools never retry outside nono.

Network currently supports blocked or explicitly unrestricted access. Unrestricted includes local services and exposes HTTP GET; domain allowlists and other nono features are not exposed yet. Console account authentication remains deferred, so this is a private single-user application, not a multi-user boundary. Unsupported/missing nono or kernel enforcement fails closed. Native tests exercise filesystem denial, symlink escapes, TCP/UDP denial with positive controls, persisted policies, and real Pi tool invocation on Linux. macOS behavior has not been verified here.

## Backend and workspace configuration

The Next.js web server owns `$XDG_DATA_HOME/console-web/connections.sqlite` (default
`~/.local/share/console-web/connections.sqlite`) independently of any running execution backend.
The registry starts empty. The user enters an origin, optional label, and access token when needed.
An authenticated `GET /v1/connection-info` checks product, API version, and persistent machine
identity before registration. The browser receives safe connection metadata, never saved tokens.

No automatic scanning, synthetic local record, or fallback selection occurs. The explicit
Check local server button probes only loopback port 3000 and fills the connection form; it never enrolls a machine.
Saved explicit connections survive web-server restarts; only a valid saved selection is reopened.
Disconnect deactivates that registry entry, clears its token, closes its managed SSH tunnel, and
stops browser polling. Recent metadata remains until explicitly forgotten; it does not stop
backend execution or erase projects, provider credentials, or history. A stale tab cannot continue
proxying through a disconnected connection. The web UI and registry remain available with no backend.

The web proxy requires HTTPS or a loopback HTTP origin (including an operator-managed SSH tunnel),
rejects redirects and non-Console resources, and bounds requests/responses. Remote connections need
an access token; a loopback backend without configured token authentication accepts an empty field.
These are trusted operator connections, not team accounts. The old implicit `/api/v1/*` web proxy
returns 410. The backend's legacy `/backends` routes are unused by the browser and are not imported
into the new registry. No existing backend data is migrated or deleted.
`catalog.sqlite` stores projects as workspace identities with canonical directory paths. A project
may register an existing directory or explicitly create one under an existing parent. Registration
does not enable agent tools. New sessions may bind to a workspace; legacy unbound sessions remain
valid. Session and project names are editable without moving directories or databases.

Every session still owns one Pi Harness and SQLite database. Its conversations now use Pi's own
`createConversation()` API, with name/request identity stored atomically in `console.conversation`.
New conversations inherit the main conversation's model and sandbox policy, then retain independent
settings, transcript, inputs, and cancellation. Requests use `/sessions/:id/conversations/:conversationId`.
The legacy session endpoints address Main when active, otherwise the first active conversation. Workspace filesystem edits
are shared; separate conversations do not create filesystem isolation. Pi scheduling is session-wide:
Resume starts the session scheduler. New input cannot implicitly resume other interrupted work.

## Machine and project lifecycle

`machine-settings.ts` persists the name, default clone directory (`~/Projects` initially), fixed
model default, and last selected configuration in `catalog.sqlite`. Pi is a backend dependency;
there is no separate Pi CLI installation step. Git availability is reported for repository cloning.
New sessions prefer the project's last model configuration, then a fixed machine default, then
the machine's last configuration. Existing connected configurations seed the remembered default
when upgrading. Unavailable saved models require an explicit selection, not a silent substitute.

Public HTTPS GitHub URLs can be cloned under the machine's project directory, with an optional
absolute override. `workspaces.ts` tracks cloning, ready, failed, and interrupted states. Clone
uses Git without user credential helpers, hooks, templates, or file/ext transports; it writes to
a temporary sibling and publishes the directory after success. Failed clones can be retried.
Registration/cloning never runs repository setup scripts or grants agent tools.

Access presets are None, Read, Edit, Project, and Setup. The web client starts project conversations
with Project: project reads/writes and commands, with network blocked. Setup explicitly grants project
writes, shell commands, and unrestricted network; existing policies stay unchanged. Commands
run Bash without startup profiles inside a fresh nono worker. Their working directory stays
within the project; saved filesystem/network grants apply to child processes. A disposable home
contains caches, temporary files, and runtime locks, without access to the operator's home or
provider credentials. Commands time out after 110 seconds, with a 125-second parent bound;
stdout/stderr are capped at 32 KiB each. Cancellation kills the worker process group. Commands
are never replayed automatically. Hard CPU/memory quotas and private-repository credential setup
are not implemented; additional toolchains may need explicit readable directories.

Deleting an idle session or conversation marks it as Trash. Deleting a project hides its sessions;
restore the project before restoring individual sessions. Moving to Trash removes neither project files nor conversation databases. The last active conversation cannot be deleted separately; delete its session instead.

Home (`/`) shows actual machine counts and selected-machine summaries. `/chat` provides machine
selection, project/conversation navigation, conversation controls, and shadcn Resizable panels. All routes
share the application header. Machine selection remains scoped to the browser tab.

## Network and agent inspection

The conversation surface has one collapsible/resizable Machines tree and on-demand agent controls.
The tree loads registered machines through the web-owned registry and scoped proxy, grouping
projects, sessions, root conversations, forks, and task-owned children. Pi's immutable conversation
IDs supply agent numbers; session numbers use catalog row identities. Naming is optional on
creation and editable afterward. Trash does not recycle these identities.

The inspector's Session, State, Tasks, Tools, and Extend panels read actual runtime data. Tools
come from Pi's installed registry with schemas, descriptions, and replay policies; selection cannot
exceed the saved sandbox grants. Extension checkboxes select actual Pi extensions, including their prompt sections and hooks.
Their tools still require saved sandbox grants. They do not install arbitrary code. Child agents
and new conversations inherit the actual extension selection. Instructions are saved separately.
Tasks lists live Pi model/tool tasks, not a catalog of example jobs.

`console.agent` supplies `read_state`, `update_state`, and explicit `subagent` delegation. New
sessions select these coordination tools without enabling filesystem/network/shell access. Existing
conversations keep their saved selection until explicitly changed. Machine-wide JSON lives in
`agent-state.sqlite`; compare-and-swap revisions reject stale full-object saves. Tool updates use
session/task receipts committed in the same SQLite transaction so replay cannot apply them twice.
State is shared across projects on the machine and must not contain credentials.

The subagent tool creates a Pi conversation owned by its durable tool task in one commit, reuses
it on replay, and submits with a stable request ID. It inherits the parent's model, instructions,
and sandbox policy; recursive delegation is excluded. Parent cancellation reaches owned work.
Forks use Pi's native `fork(entryId)` API, preserve history ancestry and current sandbox policy,
and remain independent of their parent's cancellation. Both share project files. Neither operation
creates a Git worktree. Conversation inspection exposes parent identity from Pi records.

Slash commands open inspector panels, create numbered agents/sessions, or invoke existing
cancel/resume endpoints. They execute locally as UI actions rather than being sent as prompts.
Custom hook installation/editing, example durable-job workflows, and arbitrary plugin loading
are not implemented. See [ADR 0006](decisions/0006-network-and-agent-controls.md).

## Permanent deletion and direct chat controls

Trash exposes a second, explicit confirmation for permanent deletion. A trashed session's harness
must be idle and closed before removing its Pi database and catalog record. Legacy Main's database
is removed individually; machine credentials, shared state, connection registry, and source files
are retained. Session labels use a persistent counter so deletion never reuses a number.

Pi 1.4 has no public per-conversation deletion API. `purge-conversation.ts` is a maintenance adapter
for that pinned storage schema, called only after closing the idle harness. It removes a trashed
leaf's entries, submissions, tasks, document revisions, documents, and conversation record in one
transaction, retaining minted-ID history. It refuses a different pinned Pi version pending review.
Fork descendants must be erased first. Main and task-owned children are erased through their session,
preventing dangling runtime ownership. This is logical application deletion, not a guarantee that
backups or every physical storage copy are erased. Project registration can be purged after its
sessions are permanently deleted; project source directories remain untouched.

Machine-tree rows use shadcn context menus and trailing ellipsis menus. Hover/focus replaces
trailing metadata with a square button in normal layout, keeping actions clear of labels.
Trash actions require inline confirmation. Rename edits its label; Enter/blur saves and Escape cancels. The remembered machine tree
is the sole permanent side column; agent controls open on demand in a nonmodal right-side panel.
The composer uses shadcn Popover for searchable connected models and supported thinking levels;
selections update the selected conversation immediately. The Tools panel explains empty selection
and provides explicit coordination/tool-permission setup actions.

## Settings and transport ownership

The header owns Home, Chat, and Settings. Machine selection and session creation are contextual
workspace actions, not global header controls. Connect a machine opens `/machines` in the main
display, with connection/disconnection and recent history outside Settings. `/settings` is a full
page with separate Model choices, Machine defaults, and Providers sections. Credentials and machine
defaults belong to the selected execution machine; model/thinking menu preferences belong to the
web server. Model preferences filter menus only, never change running or saved agents. Empty
preferences offer only the current model until the user selects more models in Settings.

Chat permanently reserves space only for the machine tree and conversation. The tree heading is
Machines. Each machine has a Projects section with a plus button opening a shadcn Dialog
for an existing folder, new folder, or public GitHub clone. Conversation rows sit directly under
their project; a project-row plus creates and opens one directly, with no access-selection dialog.
Tool permissions remain conversation controls. Internal session containers and the initial Main label
are hidden. Forks and children
stay nested. Machine menus route to machine-scoped Settings. Session, State, Tasks, Tools, and Extend remain scoped to the selected agent in an on-demand
right panel; project controls use that panel as well. Closing it preserves mounted drafts and returns
focus. The panel does not persist as a second rail or shrink the conversation. Tree collapse is
explicit, remembered per browser tab, and its button has no persistent selected background.
Deletion remains recoverable through Trash, with explicit permanent deletion and confirmation.

Managed SSH runs on the web server host using system OpenSSH, existing configuration/keys/agent,
strict known-host verification, and loopback-only forwarding. It does not install or launch remote
Console servers, collect SSH passwords, or weaken backend bearer authentication. Direct remote
HTTP remains prohibited; HTTPS still requires a token. Disconnect clears tokens and closes owned
tunnels. Reconnect is explicit, revalidates API identity, and asks for any required token again.
Only localhost port 3000 can be checked through the explicit local probe; there is no LAN discovery.

### Official Pi Durable example review

Reviewed official upstream revision `a87b742ff4ce262c07b7830a25c73c1442dab41b`:
[Harness](https://github.com/earendil-works/pi/blob/a87b742ff4ce262c07b7830a25c73c1442dab41b/packages/durable/test/examples/05-harness.ts),
[recovery](https://github.com/earendil-works/pi/blob/a87b742ff4ce262c07b7830a25c73c1442dab41b/packages/durable/test/examples/12-recovery.ts),
[owned subagents](https://github.com/earendil-works/pi/blob/a87b742ff4ce262c07b7830a25c73c1442dab41b/packages/durable/test/examples/21-subagent-foreground.ts),
[per-conversation sandbox](https://github.com/earendil-works/pi/blob/a87b742ff4ce262c07b7830a25c73c1442dab41b/packages/durable/test/examples/28-sandbox-per-conversation.ts),
and extension reload/restart and durable views examples.

Pi owns persisted agent choices, conversations, task ownership, submissions, and recovery. Extension
code must be registered again when reopening storage; durable records store names, not executable
code. Console follows that registry/Harness boundary and uses owned child conversations and stable
request IDs for delegation. Existing tests verify restart, explicit resume, cancellation, forks,
subagents, and real sandboxed tool invocation without paid inference. These examples do not supply
machine discovery, SSH transport, browser settings, or a production sandbox policy: Console owns
those layers. Console keeps pinned Pi 1.4.0; newer upstream examples are design references, not
proof that newer APIs are available. Hot extension replacement, custom durable jobs, and a Chord
reactive-view migration remain unimplemented. Real remote SSH and macOS isolation are unverified.

## Paged conversation history

Snapshots read the newest 50 entries through Pi's native fork-aware history API. Older pages use
an exclusive entry-ID bound on a separate history endpoint; they do not expand the snapshot or
scan the entire transcript. The web client loads earlier pages only on upward scroll or explicit
request, merges stable message IDs with polling updates, and anchors the visible message during
prepend. Opening a conversation positions the view at its latest output. Scrolling away from the
bottom suspends automatic following until the user returns there. History requests are aborted
when their conversation component unmounts.

## Default project ownership

Each machine persists a protected Default project for conversations created without a project.
Its directory is `<dataDirectory>-projects/default`, outside private databases and credentials.
New session records always reference a project and bind sandbox configuration to that directory.
Filesystem, command, write, and network authority still require the selected access preset; a
project association alone grants no tools. Existing unassigned records are associated with Default
without moving databases or changing saved sandbox policies. Legacy grants are preserved, so
this association does not retroactively confine an existing conversation to the new directory.
Sessions remain internal Pi persistence/lifecycle boundaries; this change does not merge transcripts,
introduce OS containers, or change machine-wide shared state into project-private state.

## Pi coding execution boundary

Pi Durable's official coding tools execute inside the existing nono worker, not in the provider-host
process. The child loads a limited read-only set of runtime packages and receives a sandbox-local
Node execution environment without provider credentials or Harness authority. File access remains
kernel-confined. The Bash environment adapter keeps child processes in the worker's process group;
cancellation and timeouts kill that group. Output is bounded and scratch files expire after a call.
The assigned directory is included in prompt context independently of tool enablement.

Project settings and conversation inspectors have separate navigation. Project settings contain no
conversation tabs; the conversation inspector owns Conversation, State, Tasks, Tools, and Extend.
See [native Pi coding tools](decisions/0009-native-pi-tools-in-nono.md).

## Runtime controls and project resources

Console now admits Pi steers/follow-ups during active work while retaining reject-if-busy for API
compatibility. It projects the persisted inbox, usage ledger, context estimate, live compactions,
tool calls and task dependencies. Withdrawal is scoped to the addressed conversation. Manual
compaction uses a native CompactionTask plus a receipt in one atomic Pi commit; reset uses a
request-identified native reset write. Neither action implicitly resumes an interrupted session.
Automatic compaction still uses Pi defaults. See the server guide for routes and replay semantics.

Project instructions, skill catalogs and prompt templates are read inside nono, not by an
unrestricted resource loader in Fastify. The sandbox extension renders current root instructions
and exposes explicit nested-context/resource loading. The web inspector shows the loaded sources;
resource commands expand before durable input admission, after duplicate-request detection.
Project Markdown cannot widen permissions or execute extensions. Workspace-root scope is intentional;
user resource directories, executable plugins, MCP and full CLI compatibility are separate adapters.
The user selected equivalent Console features on the existing Durable runtime. Remaining delivery
is tracked in [Pi capability delivery](pi-capabilities.md), without treating dependency APIs as completed UI.

## Readable transcript projection

The backend retains Pi's entries, tool-call IDs and error flags. The web's `chat-transcript.ts` derives
message, context and activity blocks without changing storage. Calls/results pair by call ID, including
parallel calls that finish out of order. Results whose call is outside the loaded page remain visible;
loading earlier history joins them without dropping the output. Committed results override stale live
slots. Missing results remain unknown/interrupted, not successful.

The chat uses the existing shadcn Trace components following its AI Elements patterns. Activity and
individual outputs have separate disclosures, with bounded scrollable code/terminal output. Markdown
replies render through react-markdown/remark-gfm; raw HTML and automatic remote-image loading are disabled.
Disclosure choices remain while their rows are mounted. User inspection pauses bottom-following;
Jump to latest resumes it. Grouped message aliases preserve history anchors when earlier entries merge.

`console.plan` is a rewindable conversation document populated only by `update_plan`. Status is an
agent report, not proof of verification. Tool results retain historical updates; snapshots expose the
latest plan. Forks recover the plan at the selected entry and independent conversations start without
one. The web associates plans with their recorded activity rather than generating progress from prose.
