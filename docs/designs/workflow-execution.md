# Project workflow execution

- Status: Implemented in the working tree; reconstructed design record, not release/deployment evidence.
- Recorded: 2026-11-14.
- Evidence: [server workflow contract](../packages/server.md#project-workflows), [web workflow editor](../packages/web.md#project-workflow-editor) and [source baseline](server-runtime.md#workflows).

## Problem and scope

Projects expose repeatable agent work with branch conditions and explicit owner approvals, including SHA-bound GitHub merge actions.
The current implementation composes existing Durable jobs and checkpoint storage with project-owned version records.
It does not introduce a second independent agent execution engine.

## Goals and boundaries

- Persist immutable workflow definitions and capture the version, inputs, worker policy and execution target at admission.
- Support forward-only agent, condition and approval steps with durable outputs and decision receipts.
- Deduplicate admission across retries and restart; do not promise exactly-once external tool effects or provider billing.
- Keep manual admission, cron schedules and signed GitHub triggers inside their project's ownership boundary.

## User journeys

| Given | When | Then |
| --- | --- | --- |
| An owner edits a project workflow | Save submits the current revision | A new immutable version is stored; stale revisions are rejected. |
| A run request has already been admitted | Its request identity is retried | The existing admission/task is reused with its captured version and inputs. |
| A run reaches an approval | The owner approves or rejects the displayed revision | A decision receipt is retained; rejection stops downstream work. |
| A merge approval names a repository, PR and full head SHA | Approval/execution checks the PR | A changed head is rejected; execution uses a SHA-conditional merge and recognizes an already merged matching PR. |
| A cron schedule is overdue or another occurrence remains active | The scheduler ticks | It avoids overlapping runs and advances to the next future schedule instead of replaying every missed interval. |

## Architecture and data

[Shared workflow types/schema](../../packages/contracts/src/workflows.ts) define the three step variants, bounded definitions and trigger shape.
[WorkflowService](../../packages/server/src/workflows/service.ts) stores `workflows`, `workflow_versions` and `workflow_admissions` in the Harness index database and captures the selected conversation's job policy.
[WorkflowRun](../../packages/server/src/workflows/task.ts) persists step state, outputs and approvals in Durable and creates an owned BackgroundJob for each agent step.
Condition steps read an earlier agent output; templated instructions receive explicit input and prior-step values.

[GitHubActions](../../packages/server/src/workflows/github.ts) verifies the full reviewed SHA before approval and again before a merge; it reads the backend's GitHub token without transferring it into browser configuration.
[Routes](../../packages/server/src/workflows/routes.ts) enforce project/run scopes, request schemas and exact raw-body webhook signatures before matching repository/event/action and deduplicating delivery identity.
[ProjectWorkflows](../../packages/web/src/components/projects/project-workflows.tsx) edits definitions, submits string-valued inputs, displays run/approval history and exposes explicit stop/approve/reject/invalidate actions.

## Invariants and recovery

Step IDs are unique, transitions point forward and conditions reference earlier agent steps; absent branch outputs fail rather than silently selecting a path.
Changing or disabling a definition creates a new version; existing runs keep their captured version.
Approval revisions bind the displayed action and outputs; invalidation changes the pending revision, and decision history retains actor and timestamp.
Pending admissions are recovered on scheduler ticks; retained request identities prevent duplicate Durable task admission.
External effects may remain after failure or cancellation; retry decisions must account for them.
GitHub/webhook secrets are backend-owned; bearer-authenticated clients have owner-level access to workflow actions.

## Alternatives and historical rationale

Reusing BackgroundJob and Durable checkpoints is observable in the code.
A separate workflow execution engine, parallel graph joins and cyclic transitions are not implemented; the repository does not establish a historical evaluation of those alternatives.
Future changes to those boundaries need a new proposal and migration/recovery analysis.

## Verification and maintenance

[Workflow tests](../../packages/server/test/workflows.test.ts) cover definition validation, versioning, admission, approvals and triggers; [background-job](../../packages/server/test/background-jobs.test.ts) and [job-environment tests](../../packages/server/test/job-environment.test.ts) cover the underlying worker contracts.
[Shared schema](shared-contracts.md#schemas-and-types) and [client projects](web-client.md#projects) identify related interfaces.
These are verification entry points, not a fresh claim of live-provider or GitHub validation.
Update this record, the owning guides and affected tests when step semantics, approvals, admission or trigger behavior change.
