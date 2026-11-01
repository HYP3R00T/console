# Console feature inventory

This is the single master checklist. Stable IDs are preserved from the earlier dashboard.
The MVP deliberately removes advanced integration paths; Deferred means excluded from the current
delivery boundary, not hidden functionality or authorization to implement it.

Implemented means a concrete path exists. Partial names the limit. Verification is scenario-specific;
a passing test does not prove provider entitlement, power-loss durability or arbitrary external effects.

Current source: [HTTP](../packages/server/src/http/console.ts),
[session lifecycle](../packages/server/src/sessions/service.ts),
[Pi adapter](../packages/server/src/runtime/session.ts),
[client](../packages/web/src/components/workspace.tsx).

Evidence: [backend tests](../packages/server/test/mvp.test.ts) and
[client/proxy tests](../packages/web/test/client.test.ts). Live ChatGPT login/inference and broad
browser/platform checks remain unverified. Earlier experimental data stays on disk without migration.

## Machines and connections

| ID | Feature | Status | Boundary / remaining work |
| --- | --- | --- | --- |
| NET-01 | Persistent identity and capability handshake | Deferred | Excluded from MVP; no active Console API/UI integration. |
| NET-02 | Connect/disconnect/reconnect and recent machines | Deferred | Excluded from MVP; no active Console API/UI integration. |
| NET-03 | Authenticated local proxy and token protection | Partial | Fixed local proxy; embedded backend bearer option; no environment token setup or remote registry. |
| NET-04 | Managed SSH forwarding | Deferred | Excluded from MVP; no active Console API/UI integration. |
| NET-05 | Machine name, project directory and model defaults | Deferred | Excluded from MVP; no active Console API/UI integration. |
| NET-06 | Remote provisioning/service management | Deferred | Excluded from MVP; no active Console API/UI integration. |
| NET-07 | Execution migration between machines | Deferred | Excluded from MVP; no active Console API/UI integration. |
| NET-08 | Multiple users and per-user authorization | Deferred | Excluded from MVP; no active Console API/UI integration. |

## Projects and stored work

| ID | Feature | Status | Boundary / remaining work |
| --- | --- | --- | --- |
| PRJ-01 | Register/create project directories | Partial | Existing canonical directories only; create-directory and clone flows removed. |
| PRJ-02 | Public GitHub clone/retry | Deferred | Excluded from MVP; no active Console API/UI integration. |
| PRJ-03 | Private repository authentication | Deferred | Excluded from MVP; no active Console API/UI integration. |
| PRJ-04 | Protected Default project and model association | Deferred | Excluded from MVP; no active Console API/UI integration. |
| PRJ-05 | Named independent work sessions | Implemented | Named independent sessions, one conversation/Harness/database per session; idempotent creation. |
| PRJ-06 | Rename and project/conversation navigation | Partial | Project/session rename and URL selection; no multi-conversation hierarchy. |
| PRJ-07 | Trash/restore/permanent deletion | Partial | Idle whole-session deletion and retry tombstones; no Trash, restore or conversation purge. |
| PRJ-08 | Isolated checkouts for concurrent editing | Deferred | Excluded from MVP; no active Console API/UI integration. |
| PRJ-09 | Diff review and verification-evidence workflow | Deferred | Excluded from MVP; no active Console API/UI integration. |

## Model access and content

| ID | Feature | Status | Boundary / remaining work |
| --- | --- | --- | --- |
| MOD-01 | Built-in providers, supported login and catalog refresh | Partial | One supported ChatGPT provider and persisted login; no refresh/custom-provider API. |
| MOD-02 | Session model/thinking/instructions | Implemented | Idle-only explicit model, thinking and instruction save; no machine defaults/favorites. |
| MOD-03 | Custom/local endpoints, headers and model overrides | Deferred | Excluded from MVP; no active Console API/UI integration. |
| MOD-04 | Virtual-model routing | Deferred | Excluded from MVP; no active Console API/UI integration. |
| MOD-05 | Attachments and non-text result rendering | Deferred | Excluded from MVP; no active Console API/UI integration. |
| MOD-06 | Image generation and classification | Deferred | Excluded from MVP; no active Console API/UI integration. |
| MOD-07 | Token/cache/cost and context inspection | Deferred | Excluded from MVP; no active Console API/UI integration. |
| MOD-08 | Usage aggregation and enforced cost budgets | Deferred | Excluded from MVP; no active Console API/UI integration. |

## Sandboxing and execution authority

| ID | Feature | Status | Boundary / remaining work |
| --- | --- | --- | --- |
| SEC-01 | Native nono worker confinement | Deferred | Excluded from MVP; no active Console API/UI integration. |
| SEC-02 | Filesystem grants and access presets | Deferred | Excluded from MVP; no active Console API/UI integration. |
| SEC-03 | Network policy | Deferred | Excluded from MVP; no active Console API/UI integration. |
| SEC-04 | Native Pi read/write/edit/bash | Implemented | Only native CodingTools and NodeExecutionEnv; backend host authority. |
| SEC-05 | Child environment and credential separation | Deferred | Excluded from MVP; no active Console API/UI integration. |
| SEC-06 | Command timeout and descendant cancellation | Partial | Native shell cancellation exercised; no Console supervisor or global command deadline. |
| SEC-07 | Output bounds and scratch cleanup | Partial | Native bounded tool output; no full-output retrieval or Console scratch lifecycle. |
| SEC-08 | CPU/memory/disk/concurrency quotas | Deferred | Excluded from MVP; no active Console API/UI integration. |
| SEC-09 | Executable plugin/MCP trust review | Deferred | Excluded from MVP; no active Console API/UI integration. |
| SEC-10 | Durable human approval for consequential tools | Deferred | Excluded from MVP; no active Console API/UI integration. |

## Agent runtime, history and recovery

| ID | Feature | Status | Boundary / remaining work |
| --- | --- | --- | --- |
| RUN-01 | Durable transcript/inbox and request deduplication | Implemented | Pi SQLite history and stable request admission; changed text with the same ID rejected. |
| RUN-02 | Steer/follow-up/reject and queued withdrawal | Deferred | Excluded from MVP; no active Console API/UI integration. |
| RUN-03 | Cancel and explicit Resume after interruption | Implemented | Explicit per-session Resume; cancellation persists; siblings have separate schedulers. |
| RUN-04 | Native history forks | Deferred | Excluded from MVP; no active Console API/UI integration. |
| RUN-05 | History/reasoning and context-boundary navigation | Partial | Paged text/tool/reasoning history; no arbitrary-entry navigation or fork UI. |
| RUN-06 | Compaction and reset/handoff | Partial | Automatic Pi compaction retained; manual compact/reset/handoff endpoints removed. |
| RUN-07 | Runtime policy configuration | Deferred | Excluded from MVP; no active Console API/UI integration. |
| RUN-08 | Live task ownership/dependency inspection | Deferred | Excluded from MVP; no active Console API/UI integration. |
| RUN-09 | Agent-accessible history search | Deferred | Excluded from MVP; no active Console API/UI integration. |
| RUN-10 | Durable full-output artifacts/retrieval | Deferred | Excluded from MVP; no active Console API/UI integration. |
| RUN-11 | Parked-task retry and failure diagnosis | Deferred | Excluded from MVP; no active Console API/UI integration. |
| RUN-12 | Abrupt-crash/external-effect recovery proof | Partial | Graceful reopen, cancellation and SIGKILL during generation tested; power loss/general effects unproven. |
| RUN-13 | Operational reports/telemetry | Partial | Sanitized runtime report categories/IDs and API failure logs; no telemetry pipeline. |
| RUN-14 | One executing session per project | Implemented | One lifecycle queue owns admission, configuration, cancellation, recovery and deletion; unavailable/interrupted siblings block execution. |

## Resources and extensibility

| ID | Feature | Status | Boundary / remaining work |
| --- | --- | --- | --- |
| EXT-01 | Root/nested workspace instructions | Deferred | Excluded from MVP; no active Console API/UI integration. |
| EXT-02 | SYSTEM/APPEND_SYSTEM sections | Deferred | Excluded from MVP; no active Console API/UI integration. |
| EXT-03 | Skills and parameterized templates | Deferred | Excluded from MVP; no active Console API/UI integration. |
| EXT-04 | Additional resource directories/diagnostics | Deferred | Excluded from MVP; no active Console API/UI integration. |
| EXT-05 | Installed extension/tool selection | Deferred | Excluded from MVP; no active Console API/UI integration. |
| EXT-06 | Package install/remove/hot reload | Deferred | Excluded from MVP; no active Console API/UI integration. |
| EXT-07 | Typed hooks and custom interactive tools | Deferred | Excluded from MVP; no active Console API/UI integration. |
| EXT-08 | MCP lifecycle/credentials/resources/exposure | Deferred | Excluded from MVP; no active Console API/UI integration. |
| EXT-09 | Code Mode | Deferred | Excluded from MVP; no active Console API/UI integration. |
| EXT-10 | Deferred tool discovery/search | Deferred | Excluded from MVP; no active Console API/UI integration. |
| EXT-11 | Mid-run agent configuration | Deferred | Excluded from MVP; no active Console API/UI integration. |

## Coordination and durable workflows

| ID | Feature | Status | Boundary / remaining work |
| --- | --- | --- | --- |
| AGT-01 | Foreground task-owned subagents | Deferred | Excluded from MVP; no active Console API/UI integration. |
| AGT-02 | Background spawn/message/wait/stop/report-back | Deferred | Excluded from MVP; no active Console API/UI integration. |
| AGT-03 | Revisioned shared state | Deferred | Excluded from MVP; no active Console API/UI integration. |
| AGT-04 | Atomic shared-state path operations | Deferred | Excluded from MVP; no active Console API/UI integration. |
| AGT-05 | Recorded conversation plans | Deferred | Excluded from MVP; no active Console API/UI integration. |
| AGT-06 | Checkpointed application jobs and durable sleep/wake | Deferred | Excluded from MVP; no active Console API/UI integration. |
| AGT-07 | Durable approval/review gates | Deferred | Excluded from MVP; no active Console API/UI integration. |
| AGT-08 | Schedules/authenticated event triggers | Deferred | Excluded from MVP; no active Console API/UI integration. |
| AGT-09 | Explicit project memory | Deferred | Excluded from MVP; no active Console API/UI integration. |

## Web, other clients and operations

| ID | Feature | Status | Boundary / remaining work |
| --- | --- | --- | --- |
| UI-01 | Markdown/collapsible activity, plans and output | Partial | Markdown, reasoning/tool disclosures and error flags; advanced grouping/plans removed. |
| UI-02 | History anchoring and paused bottom-follow | Partial | Paged history merge retains loaded messages; no scroll anchoring or follow controls. |
| UI-03 | On-demand inspectors/settings and machine tree | Partial | Minimal project/session screen, configuration and provider settings; no split inspectors. |
| UI-04 | Continuous model/tool event delivery | Partial | Non-overlapping polling; no SSE or WebSocket channel. |
| UI-05 | Transcript export/import/sharing | Deferred | Excluded from MVP; no active Console API/UI integration. |
| CLI-01 | Reusable client SDK and CLI/TUI | Deferred | Excluded from MVP; no active Console API/UI integration. |
| CLI-02 | Structured stream and submit-and-wait API | Deferred | Excluded from MVP; no active Console API/UI integration. |
| OPS-01 | Persistent data configuration/storage inspection | Implemented | Absolute data directory, fresh MVP namespace, unavailable state and explicit failed-Harness reopen. |
| OPS-02 | Supported backup/restore | Deferred | Excluded from MVP; no active Console API/UI integration. |
| OPS-03 | Cross-platform/live remote validation | Partial | Linux native tools exercised; remote deployment and live subscription use unverified. |
| OPS-04 | Crash/reconnect/backpressure/browser regressions | Partial | API race, retry, cancellation, SIGKILL, proxy and polling tests; no comprehensive browser suite. |
| OPS-05 | Measured scale and retention policy | Deferred | Excluded from MVP; no active Console API/UI integration. |
| OPS-06 | Versions/changelogs and quality tooling | Implemented | Changeset, types/tests/build, Biome, RumDL and prek; no deployment automation. |
| OPS-07 | Publishing/deployment/release automation | Deferred | Excluded from MVP; no active Console API/UI integration. |
