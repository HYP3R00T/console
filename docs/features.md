# Console feature inventory

This is the authoritative implementation checklist for Console, including Pi integration,
execution authority, product features, clients and operations. Status describes implemented
paths and stated limits, not a live health report or complete upstream parity.

[Requirements](requirements.md) owns product intent; [architecture](architecture.md) owns design
and execution boundaries. [Pi compatibility](architecture.md#pi-compatibility-and-resource-boundary) explains compatibility.
GitHub issues/PRs own assignments and delivery progress; link them here when created rather
than duplicating their task lists.

## Status and maintenance

| Status      | Meaning                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| Implemented | A concrete Console path exists within the stated limits.                         |
| Partial     | Some usable behavior exists; the remaining gap is stated.                        |
| Missing     | No supported Console integration found. Dependency support alone does not count. |
| Deferred    | Outside the current delivery boundary; needs a product decision.                 |

Implementation and verification are separate. Evidence establishes only the covered scenarios,
not every provider, OS, deployment or failure condition. Missing rows describe unchecked work;
they are not authorization to implement a design, install packages, grant credentials or deploy.

For each feature change:

1. Update the corresponding feature's status, limits and evidence here in the same change;
   preserve its stable ID, including when renaming it.
2. Split partial rows when pieces can ship independently. A backend API without its required
   UI, or a UI without its backend, does not complete an integration.
3. Link owning source/tests and delivery issues when available; state untested scenarios.
4. Update requirements/architecture when intent/contracts change. Keep implementation status
   here rather than adding another competing master checklist.

## Machines and connections

| ID     | Feature                                            | Status      | Boundary / remaining work                                                                            |
| ------ | -------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| NET-01 | Persistent identity and capability handshake       | Implemented | Product/API/machine validation before registration.                                                  |
| NET-02 | Connect/disconnect/reconnect and recent machines   | Implemented | Web-owned registry; disconnect clears tokens without stopping work.                                  |
| NET-03 | Authenticated proxy and token protection           | Implemented | Tokens server-side; HTTPS or loopback HTTP; bounded requests, no redirects; old backend hub removed. |
| NET-04 | Managed SSH forwarding                             | Implemented | Trusted keys/host checks to an existing backend; real remote use unverified.                         |
| NET-05 | Machine name, project directory and model defaults | Implemented | Persistent backend settings; changing defaults does not move files.                                  |
| NET-06 | Remote provisioning/service management             | Missing     | No installation or systemd/launchd workflow.                                                         |
| NET-07 | Execution migration between machines               | Deferred    | Connections do not move running work, databases or source.                                           |
| NET-08 | Multiple users and per-user authorization          | Deferred    | Private single-user product; bearer access is not team access control.                               |

Evidence: [identity/auth](../packages/server/src/http/console.ts),
[registry/proxy](../packages/web/src/lib/server/machine-store.ts),
[SSH](../packages/web/src/lib/server/ssh-tunnel.ts),
[registry tests](../packages/server/test/machine-store.test.ts),
[hierarchy tests](../packages/server/test/hierarchy.test.ts).

## Projects and stored work

| ID     | Feature                                         | Status      | Boundary / remaining work                                                                                                                  |
| ------ | ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PRJ-01 | Register/create project directories             | Implemented | Explicit backend-local paths; no setup code executed.                                                                                      |
| PRJ-02 | Public GitHub clone/retry                       | Implemented | Public HTTPS; temporary destination and async states; no repository hooks.                                                                 |
| PRJ-03 | Private repository authentication               | Missing     | No repository credential onboarding.                                                                                                       |
| PRJ-04 | Protected Default project and model association | Implemented | Project association sets cwd; host tools are not confined.                                                                                 |
| PRJ-05 | Named/numbered sessions and conversations       | Implemented | One hidden Harness/database per project; New conversation uses it; native IDs and idempotent creation.                                     |
| PRJ-06 | Rename and project/conversation navigation      | Implemented | Direct project/conversation tree; persistent toggles; bounded snapshot cache and coordinated switching without welcome-screen replacement. |
| PRJ-07 | Trash/restore/permanent deletion                | Implemented | Idle/dependency checks; source retained; backups not physically erased.                                                                    |
| PRJ-08 | Isolated checkouts for concurrent editing       | Missing     | Conversations/subagents currently share source files.                                                                                      |
| PRJ-09 | Diff review and verification-evidence workflow  | Missing     | No dedicated review/completion-evidence interface.                                                                                         |

Evidence: [projects](../packages/server/src/projects/workspaces.ts),
[sessions](../packages/server/src/sessions/catalog.ts),
[purge](../packages/server/src/runtime/purge.ts),
[lifecycle tests](../packages/server/test/lifecycle.test.ts),
[Default project tests](../packages/server/test/default-project.test.ts),
[purge tests](../packages/server/test/purge.test.ts).

## Model access and content

| ID     | Feature                                                 | Status      | Boundary / remaining work                                                                                                                                                        |
| ------ | ------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MOD-01 | Built-in providers, supported login and catalog refresh | Implemented | Persisted credentials and disconnect; not every provider live-tested.                                                                                                            |
| MOD-02 | Model/thinking selection and defaults                   | Implemented | Combined model/thinking label; complete Pi-reported per-model tiers, off-only/fixed-tier handling; local drafts applied on Send with retry identity and idle-only configuration. |
| MOD-03 | Custom/local endpoints, headers and model overrides     | Missing     | No Console configuration API/editor.                                                                                                                                             |
| MOD-04 | Virtual-model routing                                   | Missing     | No routing policy/configuration.                                                                                                                                                 |
| MOD-05 | Attachments and non-text result rendering               | Missing     | Text admission/projection; no end-to-end attachment path.                                                                                                                        |
| MOD-06 | Image generation and classification                     | Missing     | Pi AI services not integrated as Console tools/services.                                                                                                                         |
| MOD-07 | Token/cache/cost and context inspection                 | Implemented | Composer context ring with saved-token details and unknown/cached states; conversation ledgers/estimates, not account billing totals.                                            |
| MOD-08 | Usage aggregation and enforced cost budgets             | Missing     | No project/machine billing dashboard or spending enforcement.                                                                                                                    |

Evidence: [providers](../packages/server/src/models/providers.ts),
[credentials](../packages/server/src/models/credentials.ts),
[runtime](../packages/server/src/runtime/configuration.ts),
[usage UI](../packages/web/src/components/details/runtime.tsx),
[provider tests](../packages/server/test/console.test.ts),
[model configuration tests](../packages/server/test/sessions.test.ts).

## Sandboxing and execution authority

The maintainer removed all nono integration on 2026-10-30. These stable IDs retain the record
of intentionally removed capabilities; they do not describe hidden or disabled functionality.

| ID     | Feature                                        | Status      | Boundary / remaining work                                                                       |
| ------ | ---------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| SEC-01 | Native nono worker confinement                 | Deferred    | Removed by maintainer decision; tools now execute directly on the host.                         |
| SEC-02 | Filesystem grants and access presets           | Deferred    | Removed, including validation, API fields and editor. Project cwd is not confinement.           |
| SEC-03 | Network policy                                 | Deferred    | Removed; native tools use ordinary backend host network access.                                 |
| SEC-04 | Native Pi read/write/edit/bash                 | Implemented | CodingTools plus NodeExecutionEnv; no wrapper or legacy aliases.                                |
| SEC-05 | Child environment and credential separation    | Deferred    | Removed; host tools inherit the backend environment and account authority.                      |
| SEC-06 | Command timeout and descendant cancellation    | Partial     | Native Pi shell cancellation tested; Console-specific deadlines/supervisor removed.             |
| SEC-07 | Output bounds and scratch cleanup              | Partial     | Native Pi tool output handling retained; no Console scratch lifecycle or full-output retention. |
| SEC-08 | CPU/memory/disk/concurrency quotas             | Missing     | No resource-quota policy.                                                                       |
| SEC-09 | Executable plugin/MCP trust review             | Missing     | Markdown loader executes no code; no arbitrary plugin host integrated.                          |
| SEC-10 | Durable human approval for consequential tools | Missing     | No persisted approve/reject gate.                                                               |

Evidence: [native assembly](../packages/server/src/runtime/session.ts),
[host execution/cancellation tests](../packages/server/test/host-runtime.test.ts),
[direct execution design](architecture.md#direct-host-execution).

## Agent runtime, history and recovery

| ID     | Feature                                            | Status      | Boundary / remaining work                                                                                    |
| ------ | -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| RUN-01 | Durable transcript/inbox and request deduplication | Implemented | Pi SQLite; repeated request IDs identify the admitted operation.                                             |
| RUN-02 | Steer/follow-up/reject and queued withdrawal       | Implemented | Persisted modes; conversation-scoped withdrawal.                                                             |
| RUN-03 | Cancel and explicit Resume after interruption      | Implemented | Input cannot implicitly resume saved work; Resume schedules the session.                                     |
| RUN-04 | Native history forks                               | Implemented | Ancestry and independent cancellation; no checkout isolation.                                                |
| RUN-05 | History/reasoning and context-boundary navigation  | Partial     | Pagination/reasoning/reset/compaction visible; arbitrary-entry fork UI and full boundary navigation missing. |
| RUN-06 | Compaction and reset/handoff                       | Implemented | Automatic Pi defaults; manual retry receipts; reset retains history.                                         |
| RUN-07 | Runtime policy configuration                       | Missing     | No retry/stream timeout/compaction/progress/failed-run queue policy editor/API.                              |
| RUN-08 | Live task ownership/dependency inspection          | Implemented | Active graph, waits, sleep deadlines and blocked reasons; not historical job browsing.                       |
| RUN-09 | Agent-accessible history search                    | Missing     | Browser pagination is not agent search across compacted/reset history.                                       |
| RUN-10 | Durable full-output artifacts/retrieval            | Missing     | Full-output paths removed and scratch cleaned; retained output bounded.                                      |
| RUN-11 | Parked-task retry and failure diagnosis            | Partial     | Blocked reasons visible; no exposed retryTask or full diagnosis/recovery UI.                                 |
| RUN-12 | Abrupt-crash/external-effect recovery proof        | Partial     | Close/reopen/cancel tested; no kill-at-checkpoint/power-loss proof or general effect idempotency.            |
| RUN-13 | Operational reports/telemetry                      | Missing     | No configured Harness onReport/telemetry pipeline or diagnostic interface.                                   |

Evidence: [runtime/history](../packages/server/src/runtime/view.ts),
[routes](../packages/server/src/sessions/routes.ts),
[runtime-control tests](../packages/server/test/runtime-controls.test.ts),
[history tests](../packages/server/test/history.test.ts),
[agent/fork tests](../packages/server/test/agent-controls.test.ts).

## Resources and extensibility

| ID     | Feature                                      | Status      | Boundary / remaining work                                                               |
| ------ | -------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| EXT-01 | Root/nested workspace instructions           | Implemented | Nested context on request; no personal-home/above-workspace scanning.                   |
| EXT-02 | SYSTEM/APPEND_SYSTEM sections                | Implemented | Scoped sections; saved conversation instructions last.                                  |
| EXT-03 | Skills and parameterized templates           | Implemented | Bounded discovery/invocation; sources/content/reload; directory/filename names.         |
| EXT-04 | Additional resource directories/diagnostics  | Missing     | No additional-directory configuration or complete metadata/trust diagnostics.           |
| EXT-05 | Installed extension/tool selection           | Implemented | Actual registry, idle-only, selected from installed definitions; not a package manager. |
| EXT-06 | Package install/remove/hot reload            | Missing     | No compatible extension-package lifecycle.                                              |
| EXT-07 | Typed hooks and custom interactive tools     | Missing     | No hook configuration/examples or durable question/confirmation bridge.                 |
| EXT-08 | MCP lifecycle/credentials/resources/exposure | Missing     | No stdio/HTTP adapter, OAuth, reconnect or exposure controls.                           |
| EXT-09 | Code Mode                                    | Missing     | Durable APIs not integrated into the Console execution boundary.                        |
| EXT-10 | Deferred tool discovery/search               | Missing     | No deferred registry/exposure or agent search adapter.                                  |
| EXT-11 | Mid-run agent configuration                  | Missing     | Settings idle-only; timing/revocation semantics need design.                            |

Evidence: [resources](../packages/server/src/projects/resources.ts),
[project tools/sections](../packages/server/src/projects/context.ts),
[registry selection](../packages/server/src/runtime/configuration.ts),
[resource tests](../packages/server/test/project-resources.test.ts),
[compatibility boundary](architecture.md#pi-compatibility-and-resource-boundary).

## Coordination and durable workflows

| ID     | Feature                                              | Status      | Boundary / remaining work                                                                                                                   |
| ------ | ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| AGT-01 | Foreground task-owned subagents                      | Implemented | Explicit delegation, inherited model/cwd, stable admission, parent cancellation; no recursion.                                              |
| AGT-02 | Background spawn/message/wait/stop/report-back       | Missing     | Foreground delegation waits; no background protocol.                                                                                        |
| AGT-03 | Revisioned shared state                              | Implemented | Agent tools use native project memory with CAS/receipts; machine operator JSON remains separate.                                            |
| AGT-04 | Atomic shared-state path operations                  | Missing     | No create/update/delete/increment-by-path tools.                                                                                            |
| AGT-05 | Recorded conversation plans                          | Implemented | Durable/fork-aware reported progress; existing agents must select update_plan.                                                              |
| AGT-06 | Checkpointed application jobs and durable sleep/wake | Missing     | Runtime task APIs exist, but no Console job definitions/launch controls.                                                                    |
| AGT-07 | Durable approval/review gates                        | Missing     | No checkpointed decision lifecycle or evidence-based completion gate.                                                                       |
| AGT-08 | Schedules/authenticated event triggers               | Missing     | No automatic initiation through the bounded submission path.                                                                                |
| AGT-09 | Explicit project memory                              | Implemented | Native session document, shared across project conversations; separate histories and cross-project memory; no automatic transcript merging. |

Evidence: [coordination](../packages/server/src/runtime/coordination.ts),
[plans](../packages/server/src/runtime/plan.ts),
[coordination tests](../packages/server/test/agent-controls.test.ts),
[project runtime/memory tests](../packages/server/test/project-runtime.test.ts),
[plan persistence/fork tests](../packages/server/test/plan.test.ts).

## Web, other clients and operations

| ID     | Feature                                          | Status      | Boundary / remaining work                                                                                                                                                                             |
| ------ | ------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-01  | Markdown/collapsible activity, plans and output  | Implemented | Icon actions; raw HTML/automatic remote images disabled; bounded output display.                                                                                                                      |
| UI-02  | History anchoring and paused bottom-follow       | Implemented | Stable aliases, inspection pauses following, jump to latest.                                                                                                                                          |
| UI-03  | On-demand inspectors/settings and machine tree   | Implemented | Persistent workspace with center-pane settings/connections; machine cards and scoped forms; remembered resizing and chat drafts across same-machine management routes; machine changes still remount. |
| UI-04  | Continuous model/tool event delivery             | Partial     | Polling saved/live snapshots; no event stream or continuous tool-output channel.                                                                                                                      |
| UI-05  | Transcript export/import/sharing                 | Missing     | No supported portable archive/import/sharing workflow.                                                                                                                                                |
| CLI-01 | Reusable client SDK and CLI/TUI                  | Missing     | Internal web helper is not an external client contract.                                                                                                                                               |
| CLI-02 | Structured stream and submit-and-wait API        | Missing     | Admission returned, no bounded wait-for-answer endpoint.                                                                                                                                              |
| OPS-01 | Persistent data configuration/storage inspection | Implemented | Absolute data directory, visible paths, isolated damaged-session reporting.                                                                                                                           |
| OPS-02 | Supported backup/restore                         | Missing     | No tested coherent backup across catalogs, sessions, credentials and web registry.                                                                                                                    |
| OPS-03 | Cross-platform/live remote validation            | Partial     | Linux native tests; real SSH, macOS isolation and full provider coverage unverified.                                                                                                                  |
| OPS-04 | Crash/reconnect/backpressure/browser regressions | Partial     | API/projection tests and manual UI checks; no comprehensive browser/kill/reconnect suite.                                                                                                             |
| OPS-05 | Measured scale and retention policy              | Missing     | No throughput target, automatic artifact/history retention or capacity controls.                                                                                                                      |
| OPS-06 | Versions/changelogs and quality tooling          | Implemented | Changesets, types/tests/build, Biome, RumDL and prek; not deployment automation.                                                                                                                      |
| OPS-07 | Publishing/deployment/release automation         | Deferred    | Not configured; separately authorized actions required.                                                                                                                                               |

Evidence: [chat](../packages/web/src/components/chat/conversation.tsx),
[history following](../packages/web/src/components/chat/use-history.ts),
[polling](../packages/web/src/components/chat/use-chat-session.ts),
[tree/polling regression tests](../packages/server/test/polling.test.ts),
[projection tests](../packages/server/test/chat-transcript.test.ts),
[storage configuration](../packages/server/src/platform/configuration.ts),
[release workflow](releases.md).

## Verification limits

Evidence links identify implementation and focused automated coverage. Tests use disposable
state and scripted inference; provider login/inference, real SSH, abrupt-crash/external-effect
recovery, production scale and broad browser/platform behavior need separate live validation.
Per-change test counts, screenshots and historical audit findings belong in Git/PR history,
not an append-only journal here. Run the checks in [AGENTS.md](../AGENTS.md) for current results.

The [web guide](packages/web.md#model-catalog-and-thinking) records catalog/thinking behavior and
the known CLI/npm catalog discrepancy. Alternative storage, unchanged CLI plugins and terminal
appearance are separate scope decisions, not assumed product parity.
