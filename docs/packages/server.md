# Server

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
└── Standalone sessions → root conversation
```

- Each Console session opens one internal Durable Harness. The UI calls this a session; it does not display a separate harness level.
- A project starts with Session 1/Main. Additional sessions and conversations receive automatic names.
- Console owns project/session associations. Durable owns conversation history, inbox, tasks and checkpoints.
- Standalone sessions retain private working directories.

Data is created automatically under `~/.local/share/console`: `providers.sqlite`, `projects.sqlite`, `harnesses.sqlite` and `sessions/`. Provider credentials are plaintext in the private provider database, protected by filesystem permissions. Do not commit or expose these files. No environment-file configuration is used.

The normal entrypoint permits one running instance for the same OS user/data directory. This is not a host-wide lock across users or containers. Tests can create isolated app instances.

## HTTP contracts

HTTP commands mutate state; SSE observes conversation updates. Route files contain request/response schemas, validation and supported methods.

- Connection: `GET /health` checks liveness; `GET /v1/connection` returns product/API version and persistent backend installation ID. The ID detects alias/mismatch problems; it is not authentication.
- Providers: `src/providers/routes.ts` exposes `/v1/providers`, `/v1/provider-logins/:id` and `/v1/models/favorites`. Login prompts are answered through HTTP; credentials never return to the browser. Enabled/configured does not prove upstream entitlement or a successful inference call.
- Projects: `src/projects/routes.ts` exposes `/v1/projects`, creation/clone, per-project metadata/Git, archive/restore and `/v1/machine/settings` for the projects root.
- Sessions: `src/harnesses/routes.ts` exposes project session creation/listing, `/v1/standalone` and session conversation routes.
  - Conversation messages: `POST /v1/sessions/:sessionId/conversations/:conversationId/messages` admits `{content, requestId, model?, thinkingLevel?, attachments?, whenBusy?}`.
  - Conversation observation uses the same base path with `/events` for SSE, `/history` for older entries and `/submissions` for completion state. Snapshots and history pages include ascending raw entry IDs and their predecessor, including entries without visible messages. `/history?before=<entryId>` returns up to 50 earlier entries to fill a particular gap; it cannot be combined with a cursor. Legacy cursor pagination remains supported.
  - `/queue` lists waiting input without original attachment bytes. `PATCH /queue/:submissionId` edits text or changes `whenBusy` between `followUp` and `steer`; `expectedContent` and `expectedWhenBusy` reject stale edits. Attachments are retained. `DELETE` withdraws an unplaced input; inputs already placed cannot be edited or withdrawn.
  - `POST` to the conversation's `/stop` interrupts its work and withdraws its queued inputs without stopping sibling conversations. Steering joins at Durable's next safe boundary, rather than interrupting an in-flight provider request.
  - `POST /archive` hides an individual conversation; busy work requires `{stop:true}`. `POST /restore` restores an archived conversation. `GET /v1/archives/conversations` lists machine-wide conversation archives. `DELETE /archive` permanently erases an already archived conversation, subject to dependency and idle checks.
  - `GET /configuration` returns the tool catalog and input schemas, enabled tools, runtime facts, editable guidance, the configured model and session compaction settings. `PATCH /configuration` rejects stale revisions and changes one scope per request.
  - Conversation changes require idle work. A tool list sets the enabled names and `null` enables all built-in tools. Project tool defaults are copied when a conversation is created. Project instructions and evidence rules apply across the project. Workspace guidance applies across the machine. Both guidance overrides can restore defaults with `null`; execution facts and file handling rules remain runtime-owned.
  - Automatic compaction and the recent-token retention target are shared by conversations in one session. Changes require an idle session. `POST /compact` admits a Durable compaction task for an idle conversation with an available model, optionally focusing the summary. Compaction preserves chat history.
  - Rename preserves IDs/history. `POST /v1/sessions/:sessionId/stop` stops the whole session, including sibling conversations and queued input.

The current connection policy permits the local website origins and rejects other browser origins. API access is unauthenticated; CORS is not authentication. Feature services must stay independent of future reachability/authentication adapters.

## Behavior that must stay explicit

- Message retries reuse the same UUID request ID. Admission is deduplicated; external effects and provider billing are not guaranteed exactly once. Explicit session creation is not idempotent; conversation creation can reuse `creationId`.
- Closing a browser detaches observation without cancelling admitted work. Startup resumes standalone and available-project sessions; archived sessions remain inactive.
- New messages require an enabled, available favorite model and a supported thinking level. Model changes are rejected while the conversation is working or queued. Native follow-up and steer inputs use the active configuration; per-message model scheduling is not implemented.
- Project Remove archives the registration and its histories without deleting source files. Busy projects require explicit Stop all and archive; work must settle before archival. Restore retains identities/history without restarting interrupted work.
- Existing-directory registration resolves canonical paths and rejects duplicates. Paths are immutable; names/icons/colors are editable.
- New/clone setup uses the configured projects root, rejects occupied destinations and creates missing parents only when requested. Public HTTPS clones use isolated Git configuration; private Git authentication is not implemented. Git setup is bounded and cancels on HTTP disconnect, unlike admitted conversation work.
- All conversations offer Durable’s bundled `read`, `write`, `edit` and `bash` tools. The working directory is the project directory or standalone workspace. Tools have the backend OS user’s access, including paths outside that directory. Retired tool names are ignored in saved selections, and past calls remain visible in history. Durable storage stays outside the execution environment.

## Execution visibility

SSE snapshots include an allowlisted execution projection: running/idle/finishing state, generation attempt and retry/poll deadlines, active tool identities/statuses, compaction progress and stable run-failure reasons. Run failures survive reconnect/reopen through Durable’s live document. Raw provider errors, tool output/details, failure diagnostics and compaction error strings are excluded from this projection; ordinary transcript tool results retain their existing bounded display behavior.

## Limits and verification

- Conversation lists return at most 200 entries; SSE snapshots include recent bounded history, with older records available through pagination. Streaming has connection/frame/slow-client bounds; it is not an unbounded log feed.
- Tests in `test/` cover provider lifecycle, project setup/archive, session isolation, message deduplication, HTTP policy, reconnect and abrupt-crash recovery using fake providers. Read the relevant tests when changing a contract.
- Live-provider entitlement, remote deployment, production scale, full backup/restore and OS confinement are not established by these tests.
- Forks, subagents, scheduled triggers and permanent project deletion are not implemented.

For a production build, run `pnpm build`, then `pnpm --filter @console/server start`. Development uses the owner's separately running `mise run dev:server`; do not restart it without permission.

## Attachments

Message attachments are base64-encoded UTF-8 text/code or static PNG/JPEG/WebP: four files, 2 MB combined input and 128 KB per text file. A message can contain attachments without prompt text. The backend validates bytes and image capability, rejects malformed/binary input and images over 16 megapixels, and normalizes model images with Sharp. PDFs and other binary formats are unsupported.

Durable owns the complete admitted input: model content, original image bytes and display metadata are committed together as `console.input`. Files are not written into the project directory. History/SSE expose metadata and bounded thumbnails; a conversation-scoped entry attachment endpoint returns original bytes through the normal client request boundary. Text downloads preserve UTF-8 bytes. Attachment retention follows the conversation archive; individual attachment deletion is not implemented.

## Conversation creation

Standalone and project-session conversation creation accept an optional UUID `creationId`. Retrying that identity in the same scope returns the existing entity, including after restart; message submission separately deduplicates `requestId`. Clients use these identities on first send so opening an unsaved draft does not create empty conversations. Creation and first-message admission are separate operations: a failed send can leave a retryable empty conversation.

## Conversation archives

Individual archival is backend-owned lifecycle state in `harnesses.sqlite`. Archived conversations disappear from project lists and Recents, reject new input/history/download access and retain their Durable history. Explicit Stop and archive aborts background work as well as ordinary work and withdraws waiting input before hiding the conversation. Restore keeps identity/history without restarting that work; an archived project must be restored first.

Permanent deletion is a separate confirmed action, available only after archival. Durable 1.5.0 has no conversation-erasure operation: the version-guarded offline SQLite adapter closes the entire idle session, removes that conversation's entries, submissions, tasks and document revisions, then checkpoints and vacuums storage. It rejects dependent forks/owned conversations; delete dependent descendants first. Other session streams reconnect after maintenance. It retains only allocated IDs, an empty structural conversation record and application lifecycle tombstones to prevent ID reuse or root recreation. It does not delete project source files, upstream provider records, backups or independently copied content. It is not a forensic-erasure guarantee.

Deletion records a non-restorable pending marker before erasing history. Interrupted cleanup remains in Archives for retry; it cannot be restored into an empty conversation. The adapter must be reviewed before upgrading Durable storage. Fork creation is a separate capability, not provided by archival.

## Durable 1.5 migration

Console pins Durable, Pi AI and Chord to 1.5.0 together. SSE consumes tagged watch values and report logging reads the new report kind. The Pi AI declaration patch still supplies JSON import attributes required by TypeScript.

Conversation watches now hold bounded history windows; the API uses their `before` marker to preserve older-history pagination. SSE remains watch-based, so deferred storage writes do not delay live updates. The bundled SQLite adapter handles storage batching; Console has no custom Durable storage or SQL executor.

Before the first 1.5 backend start, stop the backend and back up the complete Console data directory, including session databases, while it is offline. Durable migrates persisted live documents and writes newer built-in task versions; do not reopen upgraded data with 1.4. Rollback requires restoring the matching pre-upgrade data backup and application version together. Agents must obtain permission before stopping or restarting the owner's backend.

Partial answer/tool progress is now persisted within 1,000 ms by default; a crash can lose that recent progress. In-flight model requests interrupted by a crash consume retry attempts, and exhausted retries or restart limits end visibly rather than parking forever. Clean close and browser disconnect retain their existing behavior.

`test/durable-migration.test.ts` restores a disposable 1.4 fixture, verifies inherited history, tool output, instructions, selected tools, forks, new writes and reopening, checks bounded-history pagination, and compares the SQLite schema before exercising offline deletion. The full suite also covers SSE delivery, queueing, archives and abrupt tool-result recovery. Owner data is not migrated by these tests.

## Runtime defaults

`GET /v1/machine/runtime-defaults` returns the machine's saved model and optional thinking level, revision, and eligible favorite models. `PUT` accepts the current revision and a replacement `defaults` object, or `null` to clear the machine default. It rejects stale writes, unavailable models and unsupported thinking levels.

New standalone conversations, session roots and project conversations copy the machine default when eligible. Existing conversations and retried creation IDs retain their stored configuration. An unavailable default remains saved but is skipped during creation. Without an eligible machine default, project conversations still inherit their session root's model and standalone or session roots may be unconfigured. An explicit model on message admission follows the usual conversation rules.
