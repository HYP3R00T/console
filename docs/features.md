# Feature inventory

The master implementation checklist. Verification describes specific checks, not production certification.

## Implemented

| ID | Feature | Evidence / limits |
| --- | --- | --- |
| BASE-01 | Fastify health endpoint | `packages/server/test/app.test.ts`; HTTP liveness and missing-route checks. |
| BASE-02 | Full-width frontend shell | shadcn Base UI Lyra/Zinc, Geist/Lucide, zero radii, animated expandable client column (200ms, reduced-motion aware), resizable backend column, context hidden on Home, independent collapse state, animated context width with its overflow clipped to prevent scrollbar flashes, anchored chevron toggles, resize enabled only when expanded (208–384px), three surface tones without divider borders, and mobile sheets. Types/build and manual desktop/mobile checks. |
| BASE-03 | Independent server/web commands | Root scripts and Mise tasks; native framework output; full interactive startup unverified. |
| OPS-06 | Versions and quality tooling | Changesets configured; types, test, builds and repository checks. |

## Partially implemented

| ID | Feature | Current boundary / evidence |
| --- | --- | --- |
| NET-01 | Connection handshake | Unauthenticated Console API version check; no persistent server identity. Server/client tests. |
| NET-02 | Device selection and connection lifecycle | Browser-local named URL bookmarks, visible device rail, search/add/forget, route selection separate from explicit connect and monitoring; reload disconnects. No remote connections or cross-tab merging. Tests and browser checks. |
| UI-03 | Settings and device navigation | Two independently collapsible columns: client/device list and backend context. Home shows saved-device status; independently collapsible device rows show real connection metadata and Connect/Disconnect/Cancel in shaded, borderless cards with vertical animation. The primary column selects Home/device/Preferences; contextual device navigation or preference categories occupy the second column, initially collapsed on context entry. Dashed, terminated tree connectors include main/subagent/fork conversations; selection and hover are independent of disclosure state. Projects and Recents separate project-bound and standalone conversation examples; New conversation opens a preview without creating data. The sidebar omits its Preview badge while content retains the notice. The hierarchy is a frontend preview only; no real projects, sessions, agents, uptime/client-count metrics or split workspace. Backend-scoped provider settings are real. Machine settings replaces the conversation tree with Providers and Back to workspace; device identity and connections remain in the first column. |
| MOD-01 | Built-in providers, supported login and catalog refresh | Pi AI catalog and generic API-key/OAuth prompt flows, private SQLite storage, disable/reconnect/remove, explicit catalog refresh. Fake-provider integration tests cover API-key/OAuth lifecycle, cancellation, persistence and redaction; live catalog/UI prompt checks. Real credential/OAuth completion and upstream entitlement unverified. |
| MOD-02 | Model selection and metadata | Backend-persisted favorites, model search, context/output/input/pricing/thinking metadata; favorites API excludes disabled/unavailable providers. Provider/model names share typography, with a 320px desktop provider catalog. Provider/model lists use shadcn Scroll Area and fill remaining desktop height; borderless rows/searches, favorites first and name-aligned details grouped into limits, capabilities and catalog/cache pricing. Catalog scrollbars hide until hover/focus; provider counts have extra right padding. Manual desktop/mobile layout checks; no chat selector, session defaults or execution yet. |

## Historical IDs: not implemented

These identifiers remain for traceability. None of the capabilities below is implemented or
committed to a roadmap. Earlier implementation and test claims do not apply to the current baseline.

| ID | Capability |
| --- | --- |
| NET-03 | Authenticated proxy and token protection |
| NET-04 | Managed SSH forwarding |
| NET-05 | Machine name, project directory and model defaults |
| NET-06 | Remote provisioning/service management |
| NET-07 | Execution migration between machines |
| NET-08 | Multiple users and per-user authorization |
| PRJ-01 | Register/create project directories |
| PRJ-02 | Public GitHub clone/retry |
| PRJ-03 | Private repository authentication |
| PRJ-04 | Protected Default project and model association |
| PRJ-05 | Named/numbered sessions and conversations |
| PRJ-06 | Rename and project/conversation navigation |
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
| RUN-01 | Durable transcript/inbox and request deduplication |
| RUN-02 | Steer/follow-up/reject and queued withdrawal |
| RUN-03 | Cancel and explicit Resume after interruption |
| RUN-04 | Native history forks |
| RUN-05 | History/reasoning and context-boundary navigation |
| RUN-06 | Compaction and reset/handoff |
| RUN-07 | Runtime policy configuration |
| RUN-08 | Live task ownership/dependency inspection |
| RUN-09 | Agent-accessible history search |
| RUN-10 | Durable full-output artifacts/retrieval |
| RUN-11 | Parked-task retry and failure diagnosis |
| RUN-12 | Abrupt-crash/external-effect recovery proof |
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
| UI-04 | Continuous model/tool event delivery |
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
