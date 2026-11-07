# Durable delivery scope

This checklist tracks the original Durable 1.5 audit's partially implemented features; it does not turn every upstream example or alternative deployment architecture into a requirement.
The working tree is the implementation under review, not a released or deployed version.

## Delivered capabilities

- Standalone forks and branch navigation: [fork tests](../packages/server/test/standalone-forks.test.ts).
- Persistent named agents with API, model tools, UI, messaging, steering, waiting and cancellation: [API tests](../packages/server/test/persistent-agent-api.test.ts), [model-tool tests](../packages/server/test/agent-tools.test.ts) and [lifecycle tests](../packages/server/test/persistent-agents.test.ts).
- Background findings delivered as display, model context or parent follow-up: [delivery tests](../packages/server/test/workflow-delivery.test.ts).
- Independent reviewer settings, saved reviewer profiles, dedicated existing worktrees and bounded review passes: [profile tests](../packages/server/test/reviewer-profiles.test.ts), [workspace tests](../packages/server/test/review-worktree.test.ts) and [pass recovery tests](../packages/server/test/review-passes.test.ts).
- Post-run checks after native edits, shell and MCP calls, with model-visible results and persistent repair bounds: [workflow tests](../packages/server/test/workflow-delivery.test.ts) and [coding-tool tests](../packages/server/test/coding-tools.test.ts).
- Completed task history, fixed diagnostic guidance and review retry: [history tests](../packages/server/test/task-history.test.ts), [diagnostic tests](../packages/server/test/task-diagnostics.test.ts) and [retry tests](../packages/server/test/review-retry.test.ts).
- Runtime policies for compaction, retry, queues, concurrency, failed runs and persistence: [policy tests](../packages/server/test/runtime-policy.test.ts).
- Model-aware coding and Plan image reads: [image tests](../packages/server/test/workspace-images.test.ts).
- Sequential recurring reviews with explicit delay, occurrence bound, missed-run behavior and cancellation: [recurrence tests](../packages/server/test/recurring-review.test.ts).
- MCP and SSH configuration reload with UI controls and stale-definition removal: [reload tests](../packages/server/test/configuration-reload.test.ts).
- Reusable general agent profiles with revision-protected settings, agent/job selection and captured model/tool policy: [profile tests](../packages/server/test/agent-profiles.test.ts).
- Editable MCP and SSH setup with atomic owner-only persistence, stale-edit protection and browser-verified settings controls: [configuration tests](../packages/server/test/configuration-edit.test.ts).
- Foreground reviewer profile discovery and captured settings: [foreground profile tests](../packages/server/test/foreground-review-profiles.test.ts).
- Failed/cancelled job retry and explicit check rechecking with preserved receipts, deduplicated admission and an input barrier: [job recovery tests](../packages/server/test/job-retry.test.ts) and [check recovery tests](../packages/server/test/check-recovery.test.ts).
- Managed extension lifecycle, explicit conversation selection and blocked-definition recovery: [lifecycle tests](../packages/server/test/managed-extensions.test.ts) and [bundle contract](extensions.md). Browser verification covers installation, replacement, removal, recovery navigation, tool execution and post-run checks.
- General scheduled jobs with captured execution policy, scheduling controls, transcripts, cancellation and retry: [job tests](../packages/server/test/background-jobs.test.ts), [environment tests](../packages/server/test/job-environment.test.ts) and [retry tests](../packages/server/test/job-retry.test.ts). Reports await checks and repairs, use the final answer, and stop recurrence on unsuccessful validation; tests cover restart during repair, interrupted checks and cancellation during validation.

These tests cover their named contracts; they do not certify every upstream capability or every external provider.
Browser verification covers the delivered configuration and workflow controls, while automated tests use fake providers and disposable local environments.

## Completion audit

The original audit identified ten partially implemented capability groups; each is now covered by the implementation and evidence above.

| Original partial capability | Delivered behavior and controls | Verification boundary |
| --- | --- | --- |
| Forks | Standalone branch routes, history inheritance and branch navigation | Fork API tests cover deduplication, archive visibility, ownership and reopening; navigation tests preserve branch identity. |
| Background agents | Persistent named agents, send, steer, wait, list and stop in API, model tools and inspector | Lifecycle tests verify retained context, duplicate suppression and separate parent/agent/session cancellation. |
| Background results | Display, context and follow-up delivery | Delivery tests inspect actual parent model context and provider calls, then reopen and retry admission. |
| Reviewer specialization | Independent models and profiles, existing dedicated checkout, bounded passes | Profile, workspace and pass tests verify capture, read-only tools, unavailable checkouts and restart mid-review; browser controls were verified. |
| Post-run validation | Shell/MCP/nested edits, model-visible checks and bounded repairs | Workflow tests verify passing and exhausted repairs, persisted attempt bounds and stopped follow-ups; check recovery tests preserve old receipts. |
| Scheduling | General jobs and reviews, bounded fixed-delay recurrence, captured execution policy and failure/cancellation rules | Scheduling UI was browser-verified; job tests now verify final repair answers, failed validation, restart during repair/checks and cancellation without early delivery. |
| Task visibility | Active graph, paginated terminal history, diagnostic guidance, supported retry/recheck controls | History tests verify 50-item pagination and sibling isolation; recovery tests cover acknowledgement, deduplication and unchanged receipts. |
| Runtime policies | Session-scoped compaction overrides, retry, queues, concurrency, failure and persistence controls | Policy tests verify schema bounds, revision conflicts, reopening and actual queued-input behavior; form tests and browser verification cover controls. |
| Image handling | Model-aware image processing for coding and Plan reads | Tests inspect actual model tool-result image bytes and dimensions rather than only configuration. |
| Extensibility | Managed bundle lifecycle, conversation selection, agent/reviewer profiles and editable integration configuration | Tests verify active-call replacement, pinned hashes, blocked-definition restoration, selection constraints, stale edits and restart; settings workflows were browser-verified. |

Final verification on 2026-11-07 passed all 199 tests (143 server, 56 web, none skipped), application type checks, production build, Biome, tracked-file and explicit new-file Prek checks, documentation links and `git diff --check`.
The final job-validation change did not alter UI components; it uses the existing result, history and transcript projections covered by job integration tests.
The working tree remains uncommitted; completion does not mean deployed, certified against live providers, or isolated from external side effects.

## Separate decisions

Reset/handoff, arbitrary hook exposure, structured telemetry, Code Mode model helpers, historical document inspection and general parallel joins were listed as available upstream rather than partially implemented deliverables.
Alternative storage, Cloudflare hosting and Chord integration are architecture choices, not completion gates for this task.
Any decision to add them should have a concrete use case and an explicit scope rather than following from the phrase "all features."
