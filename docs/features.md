# Console feature inventory

This is the single master checklist. The current baseline contains only the two features below.
Implemented means source exists; verification describes the checks, not production certification.

## Current baseline

| ID | Feature | Status | Evidence / limits |
| --- | --- | --- | --- |
| BASE-01 | Fastify health endpoint | Implemented | `src/app.ts`; server HTTP injection test; no dependency readiness. |
| BASE-02 | Next.js Hello World page | Implemented | Web `src/app/page.tsx`; type check and build; no browser automation. |

## Historical capabilities

Stable IDs are retained for traceability. Removed means no current implementation; Deferred means
previously considered but absent. Neither status commits us to rebuilding a feature.
Previous application behavior and its verification do not apply to this baseline.

| ID | Feature | Status | Boundary |
| --- | --- | --- | --- |
| NET-01 | Persistent identity and capability handshake | Removed / deferred | Not part of the Hello World baseline. |
| NET-02 | Connect/disconnect/reconnect and recent machines | Removed / deferred | Not part of the Hello World baseline. |
| NET-03 | Authenticated proxy and token protection | Removed / deferred | Not part of the Hello World baseline. |
| NET-04 | Managed SSH forwarding | Removed / deferred | Not part of the Hello World baseline. |
| NET-05 | Machine name, project directory and model defaults | Removed / deferred | Not part of the Hello World baseline. |
| NET-06 | Remote provisioning/service management | Removed / deferred | Not part of the Hello World baseline. |
| NET-07 | Execution migration between machines | Removed / deferred | Not part of the Hello World baseline. |
| NET-08 | Multiple users and per-user authorization | Removed / deferred | Not part of the Hello World baseline. |
| PRJ-01 | Register/create project directories | Removed / deferred | Not part of the Hello World baseline. |
| PRJ-02 | Public GitHub clone/retry | Removed / deferred | Not part of the Hello World baseline. |
| PRJ-03 | Private repository authentication | Removed / deferred | Not part of the Hello World baseline. |
| PRJ-04 | Protected Default project and model association | Removed / deferred | Not part of the Hello World baseline. |
| PRJ-05 | Named/numbered sessions and conversations | Removed / deferred | Not part of the Hello World baseline. |
| PRJ-06 | Rename and project/conversation navigation | Removed / deferred | Not part of the Hello World baseline. |
| PRJ-07 | Trash/restore/permanent deletion | Removed / deferred | Not part of the Hello World baseline. |
| PRJ-08 | Isolated checkouts for concurrent editing | Removed / deferred | Not part of the Hello World baseline. |
| PRJ-09 | Diff review and verification-evidence workflow | Removed / deferred | Not part of the Hello World baseline. |
| MOD-01 | Built-in providers, supported login and catalog refresh | Removed / deferred | Not part of the Hello World baseline. |
| MOD-02 | Model/thinking selection and defaults | Removed / deferred | Not part of the Hello World baseline. |
| MOD-03 | Custom/local endpoints, headers and model overrides | Removed / deferred | Not part of the Hello World baseline. |
| MOD-04 | Virtual-model routing | Removed / deferred | Not part of the Hello World baseline. |
| MOD-05 | Attachments and non-text result rendering | Removed / deferred | Not part of the Hello World baseline. |
| MOD-06 | Image generation and classification | Removed / deferred | Not part of the Hello World baseline. |
| MOD-07 | Token/cache/cost and context inspection | Removed / deferred | Not part of the Hello World baseline. |
| MOD-08 | Usage aggregation and enforced cost budgets | Removed / deferred | Not part of the Hello World baseline. |
| SEC-01 | Native nono worker confinement | Removed / deferred | Not part of the Hello World baseline. |
| SEC-02 | Filesystem grants and access presets | Removed / deferred | Not part of the Hello World baseline. |
| SEC-03 | Network policy | Removed / deferred | Not part of the Hello World baseline. |
| SEC-04 | Native Pi read/write/edit/bash | Removed / deferred | Not part of the Hello World baseline. |
| SEC-05 | Child environment and credential separation | Removed / deferred | Not part of the Hello World baseline. |
| SEC-06 | Command timeout and descendant cancellation | Removed / deferred | Not part of the Hello World baseline. |
| SEC-07 | Output bounds and scratch cleanup | Removed / deferred | Not part of the Hello World baseline. |
| SEC-08 | CPU/memory/disk/concurrency quotas | Removed / deferred | Not part of the Hello World baseline. |
| SEC-09 | Executable plugin/MCP trust review | Removed / deferred | Not part of the Hello World baseline. |
| SEC-10 | Durable human approval for consequential tools | Removed / deferred | Not part of the Hello World baseline. |
| RUN-01 | Durable transcript/inbox and request deduplication | Removed / deferred | Not part of the Hello World baseline. |
| RUN-02 | Steer/follow-up/reject and queued withdrawal | Removed / deferred | Not part of the Hello World baseline. |
| RUN-03 | Cancel and explicit Resume after interruption | Removed / deferred | Not part of the Hello World baseline. |
| RUN-04 | Native history forks | Removed / deferred | Not part of the Hello World baseline. |
| RUN-05 | History/reasoning and context-boundary navigation | Removed / deferred | Not part of the Hello World baseline. |
| RUN-06 | Compaction and reset/handoff | Removed / deferred | Not part of the Hello World baseline. |
| RUN-07 | Runtime policy configuration | Removed / deferred | Not part of the Hello World baseline. |
| RUN-08 | Live task ownership/dependency inspection | Removed / deferred | Not part of the Hello World baseline. |
| RUN-09 | Agent-accessible history search | Removed / deferred | Not part of the Hello World baseline. |
| RUN-10 | Durable full-output artifacts/retrieval | Removed / deferred | Not part of the Hello World baseline. |
| RUN-11 | Parked-task retry and failure diagnosis | Removed / deferred | Not part of the Hello World baseline. |
| RUN-12 | Abrupt-crash/external-effect recovery proof | Removed / deferred | Not part of the Hello World baseline. |
| RUN-13 | Operational reports/telemetry | Removed / deferred | Not part of the Hello World baseline. |
| EXT-01 | Root/nested workspace instructions | Removed / deferred | Not part of the Hello World baseline. |
| EXT-02 | SYSTEM/APPEND_SYSTEM sections | Removed / deferred | Not part of the Hello World baseline. |
| EXT-03 | Skills and parameterized templates | Removed / deferred | Not part of the Hello World baseline. |
| EXT-04 | Additional resource directories/diagnostics | Removed / deferred | Not part of the Hello World baseline. |
| EXT-05 | Installed extension/tool selection | Removed / deferred | Not part of the Hello World baseline. |
| EXT-06 | Package install/remove/hot reload | Removed / deferred | Not part of the Hello World baseline. |
| EXT-07 | Typed hooks and custom interactive tools | Removed / deferred | Not part of the Hello World baseline. |
| EXT-08 | MCP lifecycle/credentials/resources/exposure | Removed / deferred | Not part of the Hello World baseline. |
| EXT-09 | Code Mode | Removed / deferred | Not part of the Hello World baseline. |
| EXT-10 | Deferred tool discovery/search | Removed / deferred | Not part of the Hello World baseline. |
| EXT-11 | Mid-run agent configuration | Removed / deferred | Not part of the Hello World baseline. |
| AGT-01 | Foreground task-owned subagents | Removed / deferred | Not part of the Hello World baseline. |
| AGT-02 | Background spawn/message/wait/stop/report-back | Removed / deferred | Not part of the Hello World baseline. |
| AGT-03 | Revisioned shared state | Removed / deferred | Not part of the Hello World baseline. |
| AGT-04 | Atomic shared-state path operations | Removed / deferred | Not part of the Hello World baseline. |
| AGT-05 | Recorded conversation plans | Removed / deferred | Not part of the Hello World baseline. |
| AGT-06 | Checkpointed application jobs and durable sleep/wake | Removed / deferred | Not part of the Hello World baseline. |
| AGT-07 | Durable approval/review gates | Removed / deferred | Not part of the Hello World baseline. |
| AGT-08 | Schedules/authenticated event triggers | Removed / deferred | Not part of the Hello World baseline. |
| AGT-09 | Explicit project memory | Removed / deferred | Not part of the Hello World baseline. |
| UI-01 | Markdown/collapsible activity, plans and output | Removed / deferred | Not part of the Hello World baseline. |
| UI-02 | History anchoring and paused bottom-follow | Removed / deferred | Not part of the Hello World baseline. |
| UI-03 | On-demand inspectors/settings and machine tree | Removed / deferred | Not part of the Hello World baseline. |
| UI-04 | Continuous model/tool event delivery | Removed / deferred | Not part of the Hello World baseline. |
| UI-05 | Transcript export/import/sharing | Removed / deferred | Not part of the Hello World baseline. |
| CLI-01 | Reusable client SDK and CLI/TUI | Removed / deferred | Not part of the Hello World baseline. |
| CLI-02 | Structured stream and submit-and-wait API | Removed / deferred | Not part of the Hello World baseline. |
| OPS-01 | Persistent data configuration/storage inspection | Removed / deferred | Not part of the Hello World baseline. |
| OPS-02 | Supported backup/restore | Removed / deferred | Not part of the Hello World baseline. |
| OPS-03 | Cross-platform/live remote validation | Removed / deferred | Not part of the Hello World baseline. |
| OPS-04 | Crash/reconnect/backpressure/browser regressions | Removed / deferred | Not part of the Hello World baseline. |
| OPS-05 | Measured scale and retention policy | Removed / deferred | Not part of the Hello World baseline. |
| OPS-06 | Versions/changelogs and quality tooling | Implemented | Changesets, TypeScript, server test, builds and repository checks remain. |
| OPS-07 | Publishing/deployment/release automation | Removed / deferred | Not part of the Hello World baseline. |
