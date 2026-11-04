# Feature inventory

The master implementation checklist. Verification describes specific checks, not production certification.

## Implemented

| ID | Feature | Evidence / limits |
| --- | --- | --- |
| BASE-01 | Fastify health endpoint | `packages/server/test/app.test.ts`; HTTP liveness and missing-route checks. |
| BASE-02 | Full-width frontend shell | shadcn Base UI Lyra/Zinc, Geist/Lucide, zero radii, animated expandable client column (200ms, reduced-motion aware), resizable backend column, context hidden on Home, independent collapse state, animated context width with its overflow clipped to prevent scrollbar flashes, anchored chevron toggles, resize enabled only when expanded (208–384px), three surface tones without divider borders, and mobile sheets. Types/build and manual desktop/mobile checks. |
| BASE-03 | Independent server/web commands | Root scripts and Mise tasks; native framework output; full interactive startup unverified. |
| OPS-06 | Versions and quality tooling | Changesets configured; types, test, builds and repository checks. |
| PRJ-10 | Read-only project Git metadata | Blue current-item markers, local branch names/count and registered worktree paths/branches/count with Main as the original checkout label, shaded active worktree/branch rows and aligned heading counts; main/linked, bare, detached/unborn, locked/prunable flags. Accessible inline directory square replaces the availability card. On-demand/explicit refresh; bounded Git commands, sanitized errors, no history/network/mutation. API tests cover real isolated repositories/worktrees, bare/non-Git/unavailable cases and origin policy. Browser verified live branch/worktree rendering, inline directory status and explicit refresh. |

## Partially implemented

| ID | Feature | Current boundary / evidence |
| --- | --- | --- |
| PRJ-01 | Register/create project directories | Persistent backend SQLite registry; canonical absolute paths, duplicate/conflict checks, availability, list/open and archive without deleting files. API tests cover persistence, concurrent alias registration, invalid input, permission denial and file preservation. Manual browser registration/open/removal and desktop/mobile layout verified. New-project mode initializes Git under the saved machine root; explicit missing-parent creation, collision protection and staged publication. Text generation is available through project sessions; project file/tool execution remains unavailable. |
| PRJ-06 | Rename and project/conversation navigation | Partial: backend-persisted project display name, preset icon/color, dedicated settings route via context-menu Edit and in-place project disclosure. Full-width settings with container-responsive identity/directory columns, top-right conditional Save changes and Remove/trash actions, archive confirmation, title-adjacent metadata refresh, single input focus outline and 32 searchable icons. Right-click Edit/Pin/Unpin/Remove in both sidebar modes; newest pins first, persisted in this browser per backend URL. Sidebar/editor archive actions share a confirmation and preserve files. Context-menu wrappers retain flex-column layout so compact project icons center on the rail axis. Browser measurements verified matching icon centers and full-width expanded rows; navigation/context menus retained. Pin parsing, backend isolation and stable order have automated coverage; Browser verified compact/expanded context menus, Shift+F10, Edit navigation, pin-first ordering, persistence after reload/reconnect, Unpin restoration and removal confirmation/cancel; temporary registration cleaned up. Paths/files stay unchanged. Project harness/session/conversation navigation is now real; standalone conversations are listed in Recents. API persistence/validation and legacy registry migration have automated coverage; Browser checks verified editing, sidebar updates, independent disclosure and settings navigation using a disposable registration; it was cleaned up. |
| NET-05 | Machine name, project directory and model defaults | Machine projects-root setting persists per backend and defaults to ~/Projects. Existing paths never move. Machine naming and default model settings remain unimplemented. |
| PRJ-02 | Public Git clone/retry | Public HTTPS clone with isolated Git configuration, staged publication, conflict checks, cancellation and a two-minute deadline. Manual retry; no durable/resumable job, private login, SSH, submodule or pull/update flow. Tests cover staged success/failure/cancellation and URL rejection; real public HTTPS clone and browser new/clone/settings workflows verified; test registrations/settings cleaned up. |
| NET-01 | Connection handshake | Unauthenticated Console API version check; no persistent server identity. Server/client tests. |
| NET-02 | Device selection and connection lifecycle | Browser-local named URL bookmarks, visible device rail, search/add/forget, route selection separate from explicit connect and monitoring; reload rechecks the remembered device; Disconnect, Cancel and Forget clear it. No remote connections or cross-tab merging. Tests and browser checks. |
| NET-06 | Connection extension boundary | BackendConnector opens a BackendClient with request/subscribe/probe/close. Feature hooks share this client; local HTTP owns fetch/EventSource and immediate cleanup. Server HTTP policy owns origin/CORS and an optional authorization hook before handlers. Only the local connector is implemented. Automated coverage checks path scoping, error propagation, cancellation, stream cleanup and injected server access policy. |
| UI-03 | Settings and device navigation | Two independently collapsible columns: client/device list and backend context. Home shows saved-device status; independently collapsible device rows show real connection metadata and Connect/Disconnect/Cancel in shaded, borderless cards with vertical animation. The primary column selects Home/device/Preferences; contextual device navigation or preference categories occupy the second column, initially collapsed on context entry. Projects lists real backend registrations in both sidebar modes. Recents lists standalone conversations; New conversation creates a Durable session. Project sessions and standalone conversations are implemented; forks and subagents are deferred; no uptime/client-count metrics or split workspace. Backend-scoped provider settings are real. Machine settings replaces the conversation tree with Providers/Projects categories and Back to workspace; device identity and connections remain in the first column. |
| MOD-01 | Built-in providers, supported login and catalog refresh | Pi AI catalog and generic API-key/OAuth prompt flows, private SQLite storage, disable/reconnect/remove, explicit catalog refresh. Fake-provider integration tests cover API-key/OAuth lifecycle, cancellation, persistence and redaction; live catalog/UI prompt checks. Real credential/OAuth completion and upstream entitlement unverified. |
| MOD-02 | Model selection and metadata | Backend-persisted favorites, model search, context/output/input/pricing/thinking metadata; favorites API excludes disabled/unavailable providers. Provider/model names share typography, with a 320px desktop provider catalog. Provider/model lists use shadcn Scroll Area and fill remaining desktop height; borderless rows/searches, favorites first and name-aligned details grouped into limits, capabilities and catalog/cache pricing. Model details guard the initial empty provider/model state before reading loaded data. Catalog scrollbars hide until hover/focus; provider counts have extra right padding. Manual desktop/mobile layout checks; composer favorite-model selection and supported thinking levels are validated at message admission; no machine model defaults. |
| PRJ-05 | Numbered sessions and conversations | Project → Session N → conversations, with one internal Durable Harness per session. Automatic Session 1/Main on registration/setup and startup backfill. Project context-menu New session; session plus/right-click New conversation; no naming/model dialogs or duplicate harness row. Atomic session numbering and Durable conversation-name counter. Existing IDs/transcripts preserved. Tests cover concurrent allocation, no-provider defaults, migration, persistence and isolation. First 200 conversations listed with truncation reported; no creation idempotency, independent session archive or rename. |
| PRJ-07 | Project archive and restore | Archives idle projects with their Durable histories. Busy projects require explicit Stop all and archive. Backend gates admission, stops work and preserves source files. Restore under Machine settings → Projects retains identities and history. Automated coverage for busy rejection, cancellation, admission during archive and restoration across restart. Project triggers and permanent deletion are deferred. |
| PRJ-08 | Standalone conversations | Machine-scoped Recents lists numbered conversations newest first. New conversation creates a private workspace and one Durable session. Shared composer, message admission, streaming and history. API test covers project isolation and persistence of history and workspace files across restart. Rename and standalone archival are deferred. |
| RUN-01 | Durable transcript/inbox and request deduplication | Pi Durable 1.4 owns transcript/documents/tasks/submissions; UUID request keys deduplicate message admission across restart. Sanitized HTTP status/history and explicit unanswered-input display; pending browser delivery retained for explicit Retry. Tests verify one provider call on duplicate admission and one user entry after SIGKILL recovery. No exactly-once external-effect guarantee. |
| RUN-03 | Stop and recovery | Session-wide Stop API (no chat control) serializes with admission, aborts ordinary work and withdraws queued input; backend startup resumes available-project sessions. No conversation-isolated Resume, parked-task retry UI or permanent session deletion. API tests cover sibling conversation Stop and persisted restart. |
| RUN-12 | Abrupt-crash recovery proof | An isolated child backend is SIGKILLed mid-model request; reopen recovers an answer without duplicate input. Process ownership releases on death. Fake provider only; no tool/external-effect or power-loss recovery claim. |
| UI-04 | Continuous model/tool event delivery | HTTP commands plus SSE current text snapshots/partial answers, automatic EventSource reconnect, paged history and a conditional icon-only Jump to latest. Integrated model/thinking composer and square arrow submit; header Live/Stop controls removed. 32 streams, 2 MiB frames, slow-consumer deadline. API tests verify origin policy, detached work and reconnect; browser verified context-menu session creation, automatic conversation names, model/thinking changes, conditional Latest, message isolation, reload/reconnect restoration and desktop/mobile layout using a disposable backend. No tools, attachments, Markdown, automatic history-gap filling or scale validation. |

## Historical IDs: not implemented

These identifiers remain for traceability. None of the capabilities below is implemented or
committed to a roadmap. Earlier implementation and test claims do not apply to the current baseline.

| ID | Capability |
| --- | --- |
| NET-03 | Authenticated proxy and token protection |
| NET-04 | Managed SSH forwarding |
| NET-06 | Remote provisioning/service management |
| NET-07 | Execution migration between machines |
| NET-08 | Multiple users and per-user authorization |
| PRJ-03 | Private repository authentication |
| PRJ-04 | Protected Default project and model association |
| PRJ-07 | Trash/restore/permanent deletion |
| PRJ-08 | Isolated checkouts for concurrent editing |
| PRJ-09 | Diff review and verification-evidence workflow |
| MOD-03 | Custom/local endpoints, headers and model overrides |
| MOD-04 | Virtual-model routing |
| MOD-05 | Attachments and non-text result rendering |
| MOD-06 | Image generation and classification |
| MOD-07 | Token/cache/cost and context inspection |
| MOD-08 | Usage aggregation and enforced cost budgets |
| SEC-01 | Native nono worker confinement |
| SEC-02 | Filesystem grants and access presets |
| SEC-03 | Network policy |
| SEC-04 | Native Pi read/write/edit/bash |
| SEC-05 | Child environment and credential separation |
| SEC-06 | Command timeout and descendant cancellation |
| SEC-07 | Output bounds and scratch cleanup |
| SEC-08 | CPU/memory/disk/concurrency quotas |
| SEC-09 | Executable plugin/MCP trust review |
| SEC-10 | Durable human approval for consequential tools |
| RUN-02 | Steer/follow-up/reject and queued withdrawal |
| RUN-04 | Native history forks |
| RUN-05 | History/reasoning and context-boundary navigation |
| RUN-06 | Compaction and reset/handoff |
| RUN-07 | Runtime policy configuration |
| RUN-08 | Live task ownership/dependency inspection |
| RUN-09 | Agent-accessible history search |
| RUN-10 | Durable full-output artifacts/retrieval |
| RUN-11 | Parked-task retry and failure diagnosis |
| RUN-13 | Operational reports/telemetry |
| EXT-01 | Root/nested workspace instructions |
| EXT-02 | SYSTEM/APPEND_SYSTEM sections |
| EXT-03 | Skills and parameterized templates |
| EXT-04 | Additional resource directories/diagnostics |
| EXT-05 | Installed extension/tool selection |
| EXT-06 | Package install/remove/hot reload |
| EXT-07 | Typed hooks and custom interactive tools |
| EXT-08 | MCP lifecycle/credentials/resources/exposure |
| EXT-09 | Code Mode |
| EXT-10 | Deferred tool discovery/search |
| EXT-11 | Mid-run agent configuration |
| AGT-01 | Foreground task-owned subagents |
| AGT-02 | Background spawn/message/wait/stop/report-back |
| AGT-03 | Revisioned shared state |
| AGT-04 | Atomic shared-state path operations |
| AGT-05 | Recorded conversation plans |
| AGT-06 | Checkpointed application jobs and durable sleep/wake |
| AGT-07 | Durable approval/review gates |
| AGT-08 | Schedules/authenticated event triggers |
| AGT-09 | Explicit project memory |
| UI-01 | Markdown/collapsible activity, plans and output |
| UI-02 | History anchoring and paused bottom-follow |
| UI-05 | Transcript export/import/sharing |
| CLI-01 | Reusable client SDK and CLI/TUI |
| CLI-02 | Structured stream and submit-and-wait API |
| OPS-01 | Persistent data configuration/storage inspection |
| OPS-02 | Supported backup/restore |
| OPS-03 | Cross-platform/live remote validation |
| OPS-04 | Crash/reconnect/backpressure/browser regressions |
| OPS-05 | Measured scale and retention policy |
| OPS-07 | Publishing/deployment/release automation |

The workspace New conversation action aligns vertically with Home in the primary column.
Collapsed workspace navigation exposes direct project/Recents folder shortcuts; only the top
chevron expands the panel. The footer uses the label Machine settings.
