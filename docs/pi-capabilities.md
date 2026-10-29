# Pi capability delivery

Scope: the requested Console expansion from the 2026-10-29 audit. The three upstream surfaces
are distinct: Pi AI provides model access; Pi Durable provides the durable runtime; the Pi CLI
and disler's Durable Pi application add their own product features. Installing the runtime does
not load CLI skills, MCP servers, configuration, or plugins.

Baseline: installed Pi packages 1.4.0. This is a delivery record, not a claim of complete parity.
The user selected equivalent Console features on the existing Durable runtime; unchanged Pi CLI
plugin/config-file compatibility is not required. Prefer native Durable APIs and explicit adapters.
Product intent remains in [requirements](requirements.md); runtime contracts remain in
[architecture](architecture.md). Backend and browser changes must ship together where applicable.

## Delivered foundation

- [x] Built-in provider catalog, supported login methods, persisted credentials, catalog refresh.
- [x] Per-conversation models/thinking, project and machine defaults.
- [x] Explicit backend connections, managed SSH transport, project registration/public clones.
- [x] Persistent sessions/conversations, Default project, history pagination, exposed reasoning.
- [x] Native Pi read/write/edit/bash under nono; explicit filesystem/command/network grants.
- [x] Native history forks, foreground task-owned children, machine-wide revisioned shared state.
- [x] Installed extension selection, instructions, tool selection, deletion/restore/purge.

These describe implementation. Live authentication for every provider, real remote SSH, macOS
isolation, power-loss recovery, and production throughput have not been established.

## Runtime controls delivered in this increment

- [x] Send steers during work and follow-ups after a run; retain reject-if-busy for API compatibility.
- [x] Inspect and withdraw queued input; prevent cross-conversation withdrawal.
- [x] Preserve delivery mode and request identity through uncertain browser retries.
- [x] Keep interrupted sessions paused until explicit Resume or Cancel.
- [x] Surface Pi's recorded model usage/cost and estimated current context usage.
- [x] Display active compactions and a sanitized failure status.
- [x] Request native compaction with optional instructions and durable retry receipts.
- [x] Reset model context with an optional handoff, preserving stored history and deduplicating retries.
- [x] Show tool-call arguments, available live tool output/status, task ownership and dependencies.
- [x] Present saved work through grouped, collapsible activity and Markdown replies without changing stored history.
- [x] Record conversation plans with durable progress, historical tool results and fork-aware state.

Compaction uses Pi's defaults; no per-conversation threshold editor is implemented. Cost is the
runtime's provider/catalog estimate, not an account billing total. Context usage is estimated from
saved model context. The browser still polls; tool workers do not stream every output chunk.
Runtime control tests use temporary databases and faux providers, including a real compaction
task over long history. They do not submit personal work or make paid inference requests.

## Remaining implementation

### Project resources

- [x] Discover project-root instructions and load nested instructions on request inside the workspace.
- [x] Load project SYSTEM/APPEND_SYSTEM Markdown as scoped prompt sections; saved conversation instructions remain last.
- [x] Discover/invoke skills and reusable parameterized prompt templates.
- [x] Expose discovered sources, contents and reload in the web app.
- [ ] Add a richer diagnostics/trust editor for executable resources and additional user directories.
- [ ] Support explicitly configured user resource directories without reading a personal home implicitly.

### Model services and multimodal work

- [ ] Configure custom/compatible/local provider endpoints, model overrides and headers.
- [ ] Attach files/images; render returned images and other supported content blocks.
- [ ] Integrate image generation and classification where supported by Pi AI.
- [ ] Add per-session compaction/retry/progress configuration and usage aggregation.

### Extensions and tools

- [ ] Configure MCP servers, credentials, connections, resources and exposure controls.
- [ ] Install/uninstall/reload compatible extensions and packages with explicit authority.
- [ ] Add Code Mode and deferred tool search under the existing execution boundary.
- [ ] Add typed hook configuration, examples and failure/restart verification.
- [ ] Preserve long tool output in a bounded durable store; expose retrieval and streaming.

Pi CLI extensions and Pi Durable extensions have different host APIs. Compatibility must be
demonstrated per adapter; do not execute a CLI extension directly inside the privileged backend
and describe that as sandboxed Durable compatibility.

The current resource adapter executes no project code. It reads Markdown inside the workspace
through nono, without scanning the user's home or ancestors above the workspace. Skill names come
from directories; prompt names from Markdown filenames. Discovery is bounded and does not follow
symlink directories/files. Saving or registering a workspace does not grant arbitrary plugin execution.

### Durable work and agent coordination

- [ ] Background children with spawn/message/wait/stop/report-back behavior.
- [ ] Explicit workspace/check-out isolation for concurrent editing.
- [ ] Checkpointed jobs, sleeping/waking, durable approval and review gates.
- [ ] Schedules and authenticated event triggers through the same submission path.
- [ ] Atomic path-level shared-state operations and agent-accessible history search.
- [ ] Mid-run configuration changes with defined timing and permission semantics.

### Clients and operations

- [ ] Backend event stream, web proxy/consumer, reconnect and backpressure tests.
- [ ] Dedicated CLI/TUI, reusable client SDK, structured streaming and submit-and-wait API.
- [x] Rich Markdown/code rendering with collapsible tool output and recorded plans.
- [ ] Transcript export/import and explicit sharing.
- [ ] Complete fork-entry selection, context-boundary visibility and tree navigation.
- [ ] Explicit remote provisioning/service-management workflows and execution migration design.
- [ ] Backup/restore, resource quotas, cost limits and abrupt-crash/external-effect recovery proof.

Deployment, publishing, external messages, credential grants and irreversible operations still
require their normal explicit authorization. Implementing a control is not authorization to use
it against the user's infrastructure. Terminal appearance and alternative storage engines are
separate compatibility targets; the web product does not need every terminal-specific control.
