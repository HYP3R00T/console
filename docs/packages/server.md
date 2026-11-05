# Server

The backend owns provider credentials, registered projects and durable conversations. The browser is a client, not the execution host. See the [README](../../README.md) for setup and checks.

## Ownership

- `src/main.ts`: composes services, claims startup ownership, listens on `127.0.0.1:3000` and closes services on shutdown.
- `src/app.ts`: creates Fastify and registers services and HTTP policy. Tests can supply isolated services and storage.
- `src/http/connection.ts`: liveness, protocol handshake, browser-origin restrictions and the authorization integration point.
- `src/providers/`: Pi AI catalog, API-key/OAuth login, enabled state, credentials and model favorites.
- `src/projects/`: directory registrations, project defaults, Git setup/inspection and project archive/restore.
- `src/harnesses/`: project/session index, Durable runtime, conversation admission, history, event projections and read-only tool registration.
- `src/execution/`: the injectable `ProjectExecutor` boundary and current local read-only adapter.
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
- Standalone sessions retain private working directories; they do not receive project inspection tools.

Data is created automatically under `~/.local/share/console`: `providers.sqlite`, `projects.sqlite`, `harnesses.sqlite` and `sessions/`. Provider credentials are plaintext in the private provider database, protected by filesystem permissions. Do not commit or expose these files. No environment-file configuration is used.

The normal entrypoint permits one running instance for the same OS user/data directory. This is not a host-wide lock across users or containers. Tests can create isolated app instances.

## HTTP contracts

HTTP commands mutate state; SSE observes conversation updates. Route files contain request/response schemas, validation and supported methods.

- Connection: `GET /health` checks liveness; `GET /v1/connection` returns product/API version and persistent backend installation ID. The ID detects alias/mismatch problems; it is not authentication.
- Providers: `src/providers/routes.ts` exposes `/v1/providers`, `/v1/provider-logins/:id` and `/v1/models/favorites`. Login prompts are answered through HTTP; credentials never return to the browser. Enabled/configured does not prove upstream entitlement or a successful inference call.
- Projects: `src/projects/routes.ts` exposes `/v1/projects`, creation/clone, per-project metadata/Git, archive/restore and `/v1/machine/settings` for the projects root.
- Sessions: `src/harnesses/routes.ts` exposes project session creation/listing, `/v1/standalone` and session conversation routes.
  - Conversation messages: `POST /v1/sessions/:sessionId/conversations/:conversationId/messages` admits `{content, requestId, model?, thinkingLevel?, attachments?, whenBusy?}`.
  - Conversation observation uses the same base path with `/events` for SSE, `/history` for older entries and `/submissions` for completion state.
  - `/queue` lists waiting input without original attachment bytes. `PATCH /queue/:submissionId` edits text or changes `whenBusy` between `followUp` and `steer`; `expectedContent` and `expectedWhenBusy` reject stale edits. Attachments are retained. `DELETE` withdraws an unplaced input; inputs already placed cannot be edited or withdrawn.
  - `POST` to the conversation's `/stop` interrupts its work and withdraws its queued inputs without stopping sibling conversations. Steering joins at Durable's next safe boundary, rather than interrupting an in-flight provider request.
  - `POST /archive` hides an individual conversation; busy work requires `{stop:true}`. `POST /restore` restores an archived conversation. `GET /v1/archives/conversations` lists machine-wide conversation archives. `DELETE /archive` permanently erases an already archived conversation, subject to dependency and idle checks.
  - Rename preserves IDs/history. `POST /v1/sessions/:sessionId/stop` stops the whole session, including sibling conversations and queued input.

The current connection policy permits the local website origins and rejects other browser origins. API access is unauthenticated; CORS is not authentication. Feature services must stay independent of future reachability/authentication adapters.

## Behavior that must stay explicit

- Message retries reuse the same UUID request ID. Admission is deduplicated; external effects and provider billing are not guaranteed exactly once. Explicit session creation is not idempotent; conversation creation can reuse `creationId`.
- Closing a browser detaches observation without cancelling admitted work. Startup resumes standalone and available-project sessions; archived sessions remain inactive.
- New messages require an enabled, available favorite model and a supported thinking level. Model changes are rejected while the conversation is working or queued. Native follow-up and steer inputs use the active configuration; per-message model scheduling is not implemented.
- Project Remove archives the registration and its histories without deleting source files. Busy projects require explicit Stop all and archive; work must settle before archival. Restore retains identities/history without restarting interrupted work.
- Existing-directory registration resolves canonical paths and rejects duplicates. Paths are immutable; names/icons/colors are editable.
- New/clone setup uses the configured projects root, rejects occupied destinations and creates missing parents only when requested. Public HTTPS clones use isolated Git configuration; private Git authentication is not implemented. Git setup is bounded and cancels on HTTP disconnect, unlike admitted conversation work.
- Project tools are `list_directory`, `read_file` and `search_text`. Application path checks and bounded output are implemented; OS sandboxing, writes and subprocess tools are not. Durable storage stays outside the execution adapter.

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

Permanent deletion is a separate confirmed action, available only after archival. Durable 1.4.0 has no conversation-erasure operation: the version-guarded offline SQLite adapter closes the entire idle session, removes that conversation's entries, submissions, tasks and document revisions, then checkpoints and vacuums storage. It rejects dependent forks/owned conversations; delete dependent descendants first. Other session streams reconnect after maintenance. It retains only allocated IDs, an empty structural conversation record and application lifecycle tombstones to prevent ID reuse or root recreation. It does not delete project source files, upstream provider records, backups or independently copied content. It is not a forensic-erasure guarantee.

Deletion records a non-restorable pending marker before erasing history. Interrupted cleanup remains in Archives for retry; it cannot be restored into an empty conversation. The adapter must be reviewed before upgrading Durable storage. Fork creation and tool-selection controls are separate capabilities, not provided by archival.
