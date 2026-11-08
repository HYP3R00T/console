# Server

The [Durable delivery checklist](../durable-delivery.md) records completed capabilities and remaining work from the feature audit.

The backend owns provider credentials, registered projects and durable conversations. The browser is a client, not the execution host. See the [README](../../README.md) for setup and checks.

## Ownership

- `src/main.ts`: composes services, claims startup ownership, listens on `127.0.0.1:3000` and closes services on shutdown.
- `src/app.ts`: creates Fastify and registers services and HTTP policy. Tests can supply isolated services and storage.
- `src/http/connection.ts`: liveness, protocol handshake, browser-origin restrictions and the authorization integration point.
- `src/providers/`: Pi AI catalog, API-key/OAuth login, enabled state, credentials and model favorites.
- `src/projects/`: directory registrations, project defaults, Git setup/inspection and project archive/restore.
- `src/harnesses/`: project/session index, Durable runtime, conversation admission, history, event projections and conversation configuration.
- `src/execution/`: the injectable host environment for Durable's coding tools.
- `src/storage/`: shared SQLite setup and process ownership.

Paths above are relative to `packages/server`. Feature routes live with their owning service; do not add a second application-wide endpoint registry to documentation.

## Data and hierarchy

```text
Backend
├── Providers and machine defaults
├── Projects → numbered sessions → conversations
└── Standalone sessions → root conversation and forks
```

- Each Console session opens one internal Durable Harness. The UI calls this a session; it does not display a separate harness level.
- A project starts with Session 1/Main. Additional sessions and conversations receive automatic names.
- Console owns project/session associations. Durable owns conversation history, inbox, tasks and checkpoints.
- Standalone sessions retain private working directories. Forks share their session’s workspace and token budget; branching does not copy or isolate files.

Data is created automatically under `~/.local/share/console`: `providers.sqlite`, `projects.sqlite`, `harnesses.sqlite` and `sessions/`. Provider credentials are plaintext in the private provider database, protected by filesystem permissions. Do not commit or expose these files. No environment-file configuration is used.

The normal entrypoint permits one running instance for the same OS user/data directory. This is not a host-wide lock across users or containers. Tests can create isolated app instances.

## HTTP contracts

HTTP commands mutate state; SSE observes conversation updates. Route files contain request/response schemas, validation and supported methods.

- Connection: `GET /health` checks liveness; `GET /v1/connection` returns product/API version and persistent backend installation ID. The ID detects alias/mismatch problems; it is not authentication.
- Providers: `src/providers/routes.ts` exposes `/v1/providers`, `/v1/provider-logins/:id` and `/v1/models/favorites`. Login prompts are answered through HTTP; credentials never return to the browser. Enabled/configured does not prove upstream entitlement or a successful inference call.
- Projects: `src/projects/routes.ts` exposes `/v1/projects`, creation/clone, per-project metadata/Git, archive/restore and `/v1/machine/settings` for the projects root.
- Sessions: `src/harnesses/routes.ts` exposes project session creation/listing, `/v1/standalone` and session conversation routes.
  - `GET /v1/standalone` lists each visible root and fork separately. `GET /v1/standalone/:sessionId` retains the original root lookup; `/v1/standalone/:sessionId/:conversationId` opens a specific branch and includes visible session branches. Archiving a root does not hide its forks.
  - Conversation messages: `POST /v1/sessions/:sessionId/conversations/:conversationId/messages` admits `{content, requestId, model?, thinkingLevel?, attachments?, whenBusy?}`.
  - Conversation observation uses the same base path with `/events` for SSE, `/history` for older entries and `/submissions` for completion state. Snapshots and history pages include ascending raw entry IDs and their predecessor, including entries without visible messages. `/history?before=<entryId>` returns up to 50 earlier entries to fill a particular gap; it cannot be combined with a cursor. Legacy cursor pagination remains supported.
  - `GET /reviews/:reviewId` returns a bounded live snapshot of a task-owned reviewer under its parent conversation. Reviewer chats are excluded from the conversation list and the ordinary chat routes.
  - `GET /tasks/history` returns terminal task receipts, newest task ID first, in pages of 50 with an opaque `cursor`. It exposes outcome status, ownership, start/end times and consecutive restart counts, without task inputs, raw result payloads or raw errors. Supported post-run check receipts additionally expose their fixed result status (`passed`, `failed`, `cancelled` or `interrupted`) so a finished task is not mistaken for a passing check. Optional `reviewId` reads an owned reviewer’s tasks under its parent’s scope; cursors cannot be reused across scopes. Review task receipts link their child transcript and report whether findings were produced.
  - `GET /tasks` projects the active Durable task graph for the conversation and its owned chats. It returns at most 100 tasks with status, ownership, and wake or blocked information.
  - `POST /reviews` schedules a one-time background review with a brief, request UUID, and optional start time in epoch milliseconds. It captures the conversation's saved model and thinking level unless `model` or `thinkingLevel` is supplied. An explicit model must be an available favorite; its thinking level defaults to unset rather than inheriting an incompatible parent setting. `thinkingLevel: null` clears thinking, and `maxTurns` sets a 1–50 round cap (default 6). These choices persist with the scheduled job and never change the parent configuration. The job waits durably when scheduled for the future, and results appear in the parent's transcript. `delivery` selects `display` (UI only), `context` (the default: model-visible on the next request without starting a run), or `followUp` (queue a parent response). Result admission and task completion commit together; older saved jobs retain display-only delivery. `DELETE /reviews/tasks/:taskId` cancels that job independently.
  - `POST /reviews/tasks/:taskId/retry` takes a fresh request UUID and starts a new review from a failed or cancelled supported-version receipt. It preserves the original brief, model, thinking level, delivery and turn cap, uses the current workspace, and revalidates model eligibility. Repeated requests return the same job across restart; the original receipt remains intact and the new history receipt links back with `retryOf`. Live and successful reviews cannot be retried.
  - `/queue` lists waiting input without original attachment bytes. `PATCH /queue/:submissionId` edits text or changes `whenBusy` between `followUp` and `steer`; `expectedContent` and `expectedWhenBusy` reject stale edits. Attachments are retained. `DELETE` withdraws an unplaced input; inputs already placed cannot be edited or withdrawn.
  - `POST` to the conversation's `/stop` interrupts its work and withdraws its queued inputs without stopping sibling conversations. Steering joins at Durable's next safe boundary, rather than interrupting an in-flight provider request.
  - `POST /continue` takes a `failedTaskId` from the execution snapshot. An idle conversation can continue its latest turn-limit, model-error, interrupted or restart-limit failure using its saved model. Admission and the latest submission pointer commit together, and retries for the same failed task reuse that submission.
  - `POST /fork` takes an inclusive transcript entry ID (`at`) and a `creationId`. It creates a conversation in the same session and returns its identity. The session list exposes the parent conversation and entry. Durable carries forward historical agent settings and transcript entries, including attachment access. Console gives the fork fresh lifecycle metadata and no submission history of its own.
  - `GET /worktrees` lists existing linked Git worktrees. `PATCH /configuration` with `worktree` attaches one to an idle project chat, or clears the attachment with `null`. Each path can have one explicit attachment. Tools, post-run checks, and owned reviews use that checkout. The backend revalidates it before execution. Forks have no worktree attachment of their own.
  - `PATCH /configuration` with `sandbox` enables or disables the workspace sandbox in an idle conversation. Enabling verifies Bubblewrap and its unprivileged user namespace. The setting persists and forks inherit it. If the namespace cannot start, tool execution fails closed.
  - `PATCH /configuration` with `remoteProfile` switches a chat in an idle session to a configured SSH profile. Pass `null` to return to local execution. The backend checks the connection and remote directory before saving the profile.
  - `PATCH /configuration` with `codeMode` opts an idle coding conversation into `codemode` and `tool_search`. The reviewer becomes discoverable if enabled. Durable stores discovered tools, scripts and nested call receipts. QuickJS has a 64 MiB VM limit and a 30-second deadline per invocation. Scripts can call only enabled tools that allow nested calls, and direct model helpers are disabled.
  - `PATCH /configuration` with `mcp` opts an idle coding conversation into the backend's configured MCP tools. Tool Search can load them for direct calls, and Code Mode can call permitted tools with structured results. Plan mode suspends MCP access. The workspace sandbox and host MCP access are mutually exclusive.
  - `POST /archive` hides an individual conversation; busy work requires `{stop:true}`. `POST /restore` restores an archived conversation. `GET /v1/archives/conversations` lists machine-wide conversation archives. `DELETE /archive` permanently erases an already archived conversation, subject to dependency and idle checks.
  - `GET /configuration` returns the tool catalog and input schemas, enabled tools, runtime facts, editable guidance, the configured model and session compaction settings. `PATCH /configuration` rejects stale revisions and changes one scope per request.
  - The configuration includes the conversation's recorded token and USD cost totals from Durable and a separate estimate for its active model context. `maxTurns` sets a conversation's tool-round limit per run, with `null` clearing the limit. Continue starts a new run with a fresh allowance.
  - `PATCH /configuration` with `tokenBudget` sets or clears a session-wide threshold. New generation and compaction requests stop once the session's recorded usage reaches it, including queued runs, Continue and reviews. The total uses retained Durable usage across the session. In-flight requests can take usage past the threshold, and erasing a conversation removes its usage. The threshold can be changed during a run.
  - `PATCH /configuration` with `planMode` switches an idle conversation to workspace reads and `submit_plan`. Console saves the prior extension and tool selections in a rewindable Durable document and restores them on exit. The saved Markdown remains readable in configuration, and a fork inherits the plan and mode as of its fork point.
  - `PATCH /configuration` with `postRunCommand` saves or clears a per-conversation shell command. After a run answers with a successful `write` or `edit`, or any shell/MCP call that may have changed files (including Code Mode calls), Durable holds queued input until the check finishes or is stopped. The check uses the selected execution workspace, times out after two minutes, and records its result in the transcript. A fork starts with checks disabled. Recovery records an interrupted check if its launch was already reserved. Results enter model context as well as Activity. `postRunRepairLimit` permits 0–5 automatic repair runs (default 0); the admitted repair input carries its attempt number across restarts and compaction. Each repair is checked even if it edits nothing. Passed, cancelled and interrupted checks never schedule repairs; Stop withdraws queued repairs. Repairs use the saved model, tool policy and session token budget.
  - Conversation changes require idle work. A tool list sets the enabled names and `null` enables all built-in tools. Project tool defaults are copied when a conversation is created. Project instructions and evidence rules apply across the project. Workspace guidance applies across the machine. Both guidance overrides can restore defaults with `null`; execution facts and file handling rules remain runtime-owned.
  - Automatic compaction and the recent-token retention target are shared by conversations in one session. Changes require an idle session. `POST /compact` admits a Durable compaction task for an idle conversation with an available model, optionally focusing the summary. Compaction preserves chat history.
  - Rename preserves IDs/history. `POST /v1/sessions/:sessionId/stop` stops the whole session, including sibling conversations, background reviews, and queued input. Conversation Stop leaves its background reviews running.

The current connection policy permits the local website origins and rejects other browser origins. API access is unauthenticated; CORS is not authentication. Feature services must stay independent of future reachability/authentication adapters.

## Behavior that must stay explicit

- Message retries reuse the same UUID request ID. Admission is deduplicated; external effects and provider billing are not guaranteed exactly once. Explicit session creation is not idempotent; conversation creation can reuse `creationId`.
- Closing a browser detaches observation without cancelling admitted work. Startup resumes standalone and available-project sessions; archived sessions remain inactive.
- New messages require an enabled, available favorite model and a supported thinking level. Model changes are rejected while the conversation is working or queued. Native follow-up and steer inputs use the active configuration; per-message model scheduling is not implemented.
- Project Remove archives the registration and its histories without deleting source files. Busy projects require explicit Stop all and archive; work must settle before archival. Restore retains identities/history without restarting interrupted work.
- Existing-directory registration resolves canonical paths and rejects duplicates. Paths are immutable; names/icons/colors are editable.
- New/clone setup uses the configured projects root, rejects occupied destinations and creates missing parents only when requested. Public HTTPS clones use isolated Git configuration; private Git authentication is not implemented. Git setup is bounded and cancels on HTTP disconnect, unlike admitted conversation work.
- Coding mode offers Durable’s bundled `read`, `write`, `edit` and `bash` tools with the backend OS user’s access. Plan mode selects only `read` and `submit_plan` and checks the canonical file path against the workspace before reading. This is a tool policy rather than OS isolation. Retired tool names are ignored in saved selections, and past calls remain visible in history. Durable storage stays outside the execution environment.
- Coding mode also offers `review_workspace`. Each call owns one reviewer with its own context and workspace reads only. By default it inherits the parent model and has a six-round cap; a saved reviewer profile selects its model, thinking, instructions, turn limit and pass count. Recovery uses the owning task ID and a stable submission key to reuse its conversation and input. Stop propagates to the reviewer.
- The optional Linux sandbox runs Pi's execution daemon under `/usr/bin/bwrap`. It mounts the checkout at `/workspace`, read-only for Plan mode and owned reviews, with system binaries and libraries mounted read-only. Shell commands and checks use the same filesystem boundary. The sandbox has a fresh home, temporary directory, environment, process namespace, and network namespace. Files and Unix sockets already in the checkout remain visible.

## Execution visibility

`GET /configuration` includes `runtimePolicy`, the persisted session-wide overrides; `PATCH /configuration` replaces that object, or resets it with `null`, under the existing revision check and only while the entire session is idle.
Omitted values retain Console/Durable defaults; policy changes affect all sibling conversations and owned reviews, survive restart, and do not affect other sessions.

- `retry` controls Durable attempts (`enabled`, `maxRetries`, `baseDelayMs`, `maxAgentDelayMs`); `stream` separately controls provider attempts and deadlines (`timeoutMs`, `maxRetries`, `maxRetryDelayMs`).
- `toolExecution` selects `parallel` or `sequential`; `steeringMode` and `followUpMode` select `all` or `one-at-a-time`; `afterFailedRun` selects `keep`, `continue`, or `withdraw` for queued input.
- `compaction` supports `reserveTokens`, `backgroundTokens`, and exact `provider/modelId` overrides, including per-model `enabled` and `keepRecentTokens`; these override the ordinary session compaction settings for that model.
- `restartLimit`, `progress` (`partialIntervalMs`, `outputIntervalMs`, `persistWithinMs`), `contextRetentionMs`, and `documentRetentionMs` control recovery, progress persistence and idle memory retention; finite bounds are enforced by the route schema.
- Session runtime settings edits these overrides, including per-model compaction; older clients retain the Context inspector editor. Blank fields follow backend defaults, and restoring defaults clears the entire policy.

SSE snapshots include an allowlisted execution projection: running/idle/finishing state, generation attempt and retry/poll deadlines, active tool identities/statuses, compaction progress and stable run-failure reasons. Run failures survive reconnect/reopen through Durable’s live document. Raw provider errors, tool output/details, failure diagnostics and compaction error strings are excluded from this projection; ordinary transcript tool results retain their existing bounded display behavior.

## Limits and verification

- Conversation lists return at most 200 entries; SSE snapshots include recent bounded history, with older records available through pagination. Streaming has connection/frame/slow-client bounds; it is not an unbounded log feed.
- Tests in `test/` cover provider lifecycle, project setup/archive, session isolation, message deduplication, HTTP policy, reconnect and abrupt-crash recovery using fake providers. Read the relevant tests when changing a contract.
- Live-provider entitlement, remote deployment, production scale, full backup/restore and OS confinement are not established by these tests.
- Project and standalone forks, foreground reviewers, one-time scheduled reviews and persistent-agent controls are implemented. Bounded recurring jobs are implemented; permanent project deletion remains unimplemented.

## Persistent agents

Conversation-scoped `/agents` routes create (`POST {id, name}`) and list (`GET`) up to 32 named agents, each with its own persistent transcript and the parent agent configuration inherited at creation.
Names are unique within the parent; UUID creation and message request IDs deduplicate retries across restarts, and forks start without agents.
`POST /agents/:agentId/messages` accepts `content`, `requestId`, optional `whenBusy` (`followUp` or `steer`) and `delivery` (`display`, `context` or `followUp`, default `context`), returning a reporter task ID for task-history tracking.
`GET /agents/:agentId` returns a bounded transcript and execution snapshot; list responses include busy state and queued inputs.
`POST /agents/:agentId/stop` with `{}` cancels active and queued work without deleting the agent; ordinary parent Stop leaves agents running, while session Stop reaches them.
Routes verify parent ownership, selected-model availability and the shared session token budget; accepted message retries return their original receipt even after the budget is exhausted.
Reports appear once in Activity, with optional model-context delivery or a parent follow-up admitted atomically with reporter completion; internal delivery entries are hidden from the transcript display.

The active-task view follows persisted conversation ownership as well as live task edges, so agents remain visible after their anchor task completes; sibling conversations remain outside the scope.
Completed-task receipts link reviewer transcripts only for actual reviewer children, not generic agent conversations.

Coding conversations also expose `background_agent` (`create`, `list`, `send`, `wait`) and `stop_background_agent`; explicit saved tool allowlists remain authoritative.
Create IDs are memoized on the tool task, send IDs derive from that task, and wait accepts only a reporter task owned by the calling conversation.
Stop is not replay-safe and is not repeated after interruption; it cancels queued input and active work without deleting context.
New agent conversations exclude the orchestration extension, preventing recursive agent creation; Plan mode and reviewers also omit these controls.

For a production build, run `pnpm build`, then `pnpm --filter @console/server start`. Development uses the owner's separately running `mise run dev:server`; do not restart it without permission.

## Attachments

Message attachments are base64-encoded UTF-8 text/code or static PNG/JPEG/WebP: four files, 2 MB combined input and 128 KB per text file. A message can contain attachments without prompt text. The backend validates bytes and image capability, rejects malformed/binary input and images over 16 megapixels, and normalizes model images with Sharp. PDFs and other binary formats are unsupported.

Durable owns the complete admitted input: model content, original image bytes and display metadata are committed together as `console.input`. Files are not written into the project directory. History/SSE expose metadata and bounded thumbnails; a conversation-scoped entry attachment endpoint returns original bytes through the normal client request boundary. Text downloads preserve UTF-8 bytes. Attachment retention follows the conversation archive; individual attachment deletion is not implemented.

Workspace image reads use Durable’s lazy Photon worker to orient, resize and convert images to the selected model’s limits. Coding tools, Plan mode and reviewers share the processor; their existing filesystem boundaries still apply.

## Conversation creation

Standalone and project-session conversation creation accept an optional UUID `creationId`. Retrying that identity in the same scope returns the existing entity, including after restart; message submission separately deduplicates `requestId`. Clients use these identities on first send so opening an unsaved draft does not create empty conversations. Creation and first-message admission are separate operations: a failed send can leave a retryable empty conversation.

## Conversation archives

Individual archival is backend-owned lifecycle state in `harnesses.sqlite`. Archived conversations disappear from project lists and Recents, reject new input/history/download access and retain their Durable history. Explicit Stop and archive aborts background work as well as ordinary work and withdraws waiting input before hiding the conversation. Restore keeps identity/history without restarting that work; an archived project must be restored first.

Permanent deletion is a separate confirmed action, available only after archival. Durable 1.5.0 has no conversation-erasure operation: the version-guarded offline SQLite adapter closes the entire idle session, removes entries, submissions, tasks and document revisions for the conversation and its task-owned descendants, then checkpoints and vacuums storage. Independent forks still block deletion. Other session streams reconnect after maintenance. It retains only allocated IDs, empty structural conversation records and application lifecycle tombstones to prevent ID reuse or root recreation. It does not delete project source files, upstream provider records, backups or independently copied content. It is not a forensic-erasure guarantee.

Deletion records a non-restorable pending marker before erasing history. Interrupted cleanup remains in Archives for retry; it cannot be restored into an empty conversation. The adapter must be reviewed before upgrading Durable storage.

## Durable 1.5 migration

Console pins Durable, Pi AI and Chord to 1.5.0 together. SSE consumes tagged watch values and report logging reads the new report kind. The Pi AI declaration patch still supplies JSON import attributes required by TypeScript.

Conversation watches now hold bounded history windows; the API uses their `before` marker to preserve older-history pagination. SSE remains watch-based, so deferred storage writes do not delay live updates. The bundled SQLite adapter handles storage batching; Console has no custom Durable storage or SQL executor.

Before the first 1.5 backend start, stop the backend and back up the complete Console data directory, including session databases, while it is offline. Durable migrates persisted live documents and writes newer built-in task versions; do not reopen upgraded data with 1.4. Rollback requires restoring the matching pre-upgrade data backup and application version together. Agents must obtain permission before stopping or restarting the owner's backend.

Partial answer/tool progress is now persisted within 1,000 ms by default; a crash can lose that recent progress. In-flight model requests interrupted by a crash consume retry attempts, and exhausted retries or restart limits end visibly rather than parking forever. Clean close and browser disconnect retain their existing behavior.

`test/durable-migration.test.ts` restores a disposable 1.4 fixture, verifies inherited history, tool output, instructions, selected tools, forks, new writes and reopening, checks bounded-history pagination, and compares the SQLite schema before exercising offline deletion. The full suite also covers SSE delivery, queueing, archives and abrupt tool-result recovery. Owner data is not migrated by these tests.

## Runtime defaults

`GET /v1/machine/runtime-defaults` returns the machine's saved model and optional thinking level, revision, and eligible favorite models. `PUT` accepts the current revision and a replacement `defaults` object, or `null` to clear the machine default. It rejects stale writes, unavailable models and unsupported thinking levels.

New standalone conversations, session roots and project conversations copy the machine default when eligible. Existing conversations and retried creation IDs retain their stored configuration. An unavailable default remains saved but is skipped during creation. Without an eligible machine default, project conversations still inherit their session root's model and standalone or session roots may be unconfigured. An explicit model on message admission follows the usual conversation rules.

## MCP servers

The backend owner can create `mcp.json` in the Console data directory beside `harnesses.sqlite`. On Unix it must be a regular file owned by the backend user with access limited to that user, for example `0600`. The backend reads it when it opens its first Harness and on explicit reload. Project files cannot supply MCP definitions.

```json
{
  "servers": {
    "example": {
      "command": "/absolute/path/to/trusted-mcp-server",
      "args": ["--stdio"],
      "env": ["EXAMPLE_TOKEN"],
      "tools": ["lookup"]
    }
  }
}
```

`args`, `env` and `tools` are optional. `env` names the backend environment variables to pass. `tools` restricts the published server tools by their original names. The backend shares one stdio connection per configured server, refreshes catalogs on change notifications, and offers a reconnect action for dropped servers. The machine configuration editor returns command/argument metadata to connected clients; environment variable values stay on the backend. Calls are treated as unsafe to replay after an interruption.

## Remote execution

The backend owner can create an owner-only `execution.json` beside `harnesses.sqlite`. The backend reads it on first Harness open and explicit reload. Conversation controls receive only profile names and configuration status; the machine configuration editor also receives SSH connection metadata and file paths, never key or known-host file contents.

```json
{
  "profiles": {
    "build-box": {
      "host": "build.example.org",
      "user": "console",
      "knownHostsFile": "/absolute/path/to/console-known-hosts",
      "hostKeyAlias": "console-build-box",
      "cwd": "/srv/console/workspace"
    }
  }
}
```

`user`, `port` and `identityFile` are optional. Provision the existing POSIX workspace and place the independently verified host key in the specified file under `hostKeyAlias`. Pi Env uses non-interactive SSH with strict host-key verification. On first connection it verifies or installs its daemon in the SSH account's home directory.

Files, commands, post-run checks and owned reviewers use the selected remote workspace. Plan mode and reviewers retain workspace-scoped read tools. Coding tools otherwise run with the remote SSH account's permissions. The profile persists across restarts and forks inherit the current selection. A missing profile, failed connection or unavailable directory stops remote execution. The local project directory remains the source for project metadata, and Console does not synchronize checkouts. SSH profiles are mutually exclusive with local worktree attachments, the Bubblewrap sandbox and host MCP access.

## Reviewer profiles

`GET /v1/machine/reviewer-profiles` returns the backend’s profile collection, revision and eligible models; `PUT` replaces the collection under that revision, including deletion by omission.
Profiles have a stable UUID, unique name, eligible favorite model, optional thinking level (`null` clears it), 1–50 round limit and reviewer instructions; the collection is limited to 100 profiles.
Scheduling a background review with `profileId` copies those settings into its task and rejects simultaneous explicit model/thinking/turn overrides.
Profile edits and deletion do not affect scheduled work; restart and Retry retain the captured instructions and identity, and model availability is checked again on new admission.
Profiles customize the read-only reviewer role without adding tools, loading code or changing parent configuration; foreground reviews can select the same profiles through `review_workspace` and discover them through `reviewer_profiles`.

Review scheduling and profiles accept optional `passes` (1–5, default 1), and the foreground `review_workspace` tool accepts the same setting.
Each extra pass rechecks missed issues and false positives and asks for a complete remaining-findings report; intermediate answers remain in the child transcript and only the final answer is delivered to the parent.
The pass count comes from committed raw answers, so compaction and restart do not reset it; each pass has its own configured tool-round allowance, and all passes share the session token budget.
Scheduled jobs and Retry preserve the captured pass count; older jobs and profiles retain one-pass behavior.

Background review scheduling accepts optional `worktree`, an existing linked worktree of the parent project; this overrides only that review's workspace and is captured for restart and Retry.
Standalone and SSH parents cannot select a dedicated local review worktree; the backend validates repository membership at admission, before starting scheduled work, and whenever tools resolve their environment.
An unavailable checkout produces a failed review receipt before model execution, without falling back to the parent's workspace; reviewers retain workspace-scoped read tools and separate read-only sandbox instances when sandboxing is enabled.
The backend does not create or delete these worktrees, and this choice does not reserve them against edits by other processes.
Machine settings → Reviewer profiles edits the collection; the Background review form can schedule from a saved profile.

Terminal task history includes fixed recovery guidance for cancellations, unavailable definitions, runtime faults and restart-limit exhaustion, without exposing raw errors or task payloads.
These receipts are terminal; replacement work does not resume them and may repeat side effects.

## Recurring reviews

`POST /reviews` accepts optional `recurrence: { intervalMs, occurrences }`: 2–1000 total reviews, separated by one minute to one year after each successful completion.
The schedule captures the same reviewer settings as a single review and creates one fresh, owned reviewer per occurrence; each result uses the selected delivery policy.
Durable checkpoints persist the current occurrence and next wake time across restart; overdue work runs once, without replaying missed intervals or overlapping occurrences.
A failed, cancelled or empty occurrence ends the schedule; cancelling the outer review task also cancels its active child, while parent conversation Stop leaves the background schedule running.
The background review form and API expose recurrence admission; active task inspection and Stop recognize its outer task, and history retains individual review receipts.

## Configuration reload

`POST /mcp/reload` and `POST /remote/reload` under a conversation path reread the backend-owned configuration files without restarting the backend; they affect every session sharing that backend.
Reload closes existing connections and can interrupt in-flight calls; MCP invalidates the old tool handles and republishes its catalog, while SSH discards cached connections and profiles.
Malformed, insecure or missing files remove the previous configuration rather than retaining stale access; malformed or insecure files set the configuration's invalid flag, while missing files mean an empty configuration.
Concurrent reloads are serialized; the routes validate the conversation scope before acting and return configuration status without commands, environment values or SSH credentials.
MCP Reconnect still reconnects only the currently loaded configuration; the Tools panel offers separate Reload MCP configuration and Reload SSH profiles controls.

## General background jobs

`POST /jobs` under a conversation path accepts `content`, a request UUID, optional epoch-millisecond `at`, `delivery` (`display`, `context` or `followUp`, default `context`) and optional `recurrence: { intervalMs, occurrences }`.
Admission captures the resolved model, thinking, enabled and offered tools, selected extensions, instructions, working directory, turn cap (default 20) and post-run check settings; each occurrence creates a fresh task-owned conversation and excludes recursive agent-control tools.
Admission also captures the parent directory, worktree, sandbox setting and SSH profile identity; a changed policy or unavailable local directory/worktree fails preflight before a model request.
Tool environments revalidate that policy for workers and their descendants; sandboxed workers use independent writable sandbox instances, while owned reviewers remain read-only.
Jobs do not create separate filesystem checkouts, so workers can still edit the same underlying checkout; older jobs without a policy snapshot retain their previous execution behavior.
Jobs share session budgets and retain normal interrupted-tool replay protections; a stable occurrence input identity and atomic result admission/completion prevent duplicate submissions and result delivery across restart.
Job reports wait for the worker's checks and bounded repair runs, use its final answer, and mark the job unsuccessful when the latest check did not pass or the worker has a run failure; a written answer alone is not a validated success.
Interrupted or cancelled checks do not become successful jobs, and stopping the job during validation produces only its cancellation receipt without delivering an earlier answer.
Recurrence uses the same bounded fixed-delay policy as recurring reviews, stopping on failure or an empty answer without overlapping or replaying missed intervals.
`DELETE /jobs/:taskId` cancels a job or recurring schedule and its active owned worker; parent conversation Stop leaves background jobs running, while session Stop cancels them.
`GET /jobs/:taskId` returns a bounded worker transcript after verifying the parent conversation and owning job task; jobs that have not started have no worker transcript.
The Tasks panel exposes active-job Stop and worker transcripts, and completed history links each occurrence to its worker; the Background job form schedules immediate, future or recurring work.

## Agent profiles

`GET /v1/machine/agent-profiles` returns the machine's profiles, revision and eligible models; `PUT` replaces the collection with the current revision and rejects stale writes, duplicate identities/names and unsupported model settings.
Each profile contains a model, thinking level, instructions, a 1–50 turn limit and an explicit list of tool names; an empty tool list grants no tools.
Conversation `POST /agents` and `POST /jobs` accept an optional `profileId`; omission retains inherited chat configuration.
Admission copies the selected profile, so later editing or deletion does not change existing agents or jobs, including after restart; retried admission identities return their original receipt.
A profile cannot enable tools absent from the parent conversation, and child orchestration tools remain excluded.

## Foreground reviewer profiles

The `reviewer_profiles` model tool lists saved profile IDs and role metadata; `review_workspace` accepts `profileId` or explicit `passes`, rejecting both together.
Profile selection checks current model eligibility and captures settings in the owned reviewer before execution; restart reuses that child even if the profile was edited or removed.
Reviewers retain workspace-scoped read tools, their existing cancellation ownership and the session token budget; profiles cannot add tools.
Existing explicit tool allowlists must enable `reviewer_profiles` to permit discovery; `review_workspace` can still use a known profile ID without it.

## MCP and SSH configuration editing

`GET /v1/machine/configuration/mcp` and `/ssh` return validated configuration, a content revision and an invalid-file flag; `PUT` accepts that revision and a replacement configuration, writes the owner-only file atomically and reloads shared connections.
Missing files return empty configuration with revision `missing`; malformed owner-only files return no contents and can be replaced, while unsafe permissions, links, non-regular files and files exceeding 64 KiB are rejected.
Only documented fields are accepted, with at most eight MCP servers or sixteen SSH profiles; environment entries are variable names rather than values, and SSH validation retains explicit trusted-host requirements.
Concurrent API saves are serialized and stale revisions return 409; manual file edits observed before replacement also invalidate a draft, but external writers do not participate in the application’s save lock.
Saving may interrupt calls in any conversation and MCP reload starts configured server commands; connection failure does not roll back saved configuration, and the Tools panel reports connection status.

## Background job recovery

`POST /jobs/tasks/:taskId/retry` requires a fresh `requestId` and `acknowledgeEffects: true`, accepts only failed or cancelled supported-version jobs owned by the conversation, and starts one replacement job immediately.
The replacement preserves instructions, model, thinking, tools, post-run checks and result delivery; it revalidates model availability, enabled parent tools and the captured workspace policy before admission.
Changed capabilities or workspace policy return 409 instead of silently changing execution; users can restore the original policy or explicitly schedule different work.
The original receipt remains intact, the new receipt records `retryOf`, and repeated retry identities return the same replacement across restart.
A retry does not resume the old worker or restart its recurring schedule; earlier external effects may remain and can happen again.

## Check recovery

`POST /checks/tasks/:taskId/recheck` requires `requestId` and `acknowledgeEffects: true`; it accepts a failed, interrupted or cancelled supported-version check in an idle conversation with a configured command, available model and remaining token budget.
It submits a new assistant request, then forces the current check after the assistant answers, even without edits; Durable's after-run barrier holds queued input until checks and configured bounded repairs finish.
This uses the current workspace and check command, not a replay of the old command, and may repeat external effects; model failure or cancellation before an answer prevents the check from starting.
The original receipt remains unchanged, the replacement check records `retryOf`, and repeated request IDs reuse the original submission after restart.

## Recovery actions by task kind

| Work | Supported action | Boundary |
| --- | --- | --- |
| Failed agent run | Continue or a new request | Continue applies only to the latest supported failure; tools may already have produced effects. |
| Tool call | Inspect its result; continue or request new work | No arbitrary tool replay endpoint. |
| Context compaction | Request compaction again while idle | Creates a new compaction task. |
| Background review | Retry failed/cancelled review | Preserves settings and its original receipt. |
| Background job | Retry with effects acknowledgement | Revalidates original capabilities and workspace policy; starts one occurrence. |
| Post-run check | Recheck with assistant | Uses current configuration and the normal after-run barrier. |
| Persistent agent request | Send another request to the same agent | Retains agent context; new input has its own request identity. |
| Recurring schedule | Inspect occurrences, retry an eligible occurrence or create a new schedule | Does not silently restart a cancelled schedule. |
| Blocked definition or migration | Restore compatible extension code, or stop the owning work | Registry changes can unblock compatible tasks; terminal receipts are not resumed. |

## Managed extensions

The [managed extension contract](../extensions.md) defines trusted bundle provisioning, revision-protected installation and replacement, removal, restart behavior and blocked-task recovery.
Managed definitions are composed with each Harness registry; installation does not automatically select their tools or hooks for conversations.

Conversation configuration accepts a separate `managedExtensions` selection and includes the active catalog in its revision, so replacement invalidates stale edits.
Selections persist through restart and forks, are suspended in Plan mode, and cannot coexist with sandbox or remote execution.
Configured post-run checks run after every answered turn while managed extensions are selected, including turns without tool calls, because trusted hooks may change files.

## Commands and scoped settings

`GET /v1/commands` returns a version-1 catalog of supported command IDs, target scopes, HTTP methods/path templates and request schemas, captured from the owning feature routes.
It advertises operations rather than live availability; existing handlers retain validation, idle checks and retry semantics, and duplicate IDs fail registration.
The dependency-free `@console/contracts` workspace package owns common command types, setting metadata and configuration schemas.

Machine workspace guidance, project agent settings and session runtime settings have dedicated read/update endpoints under their owning scope, with scope-specific revisions and rejection of stale writes and unknown fields.
Their route definitions live in `src/harnesses/routes.ts`; reads do not require selecting a conversation, and updates share persistence helpers with legacy conversation configuration.
Project tools remain creation defaults, guidance remains shared, and session policies affect sibling conversations and owned workers.
Token budgets remain editable during generation; compaction and runtime-policy changes require the whole session idle.
The legacy mixed-scope configuration endpoint remains supported, and existing runtime-default revision behavior is unchanged.
