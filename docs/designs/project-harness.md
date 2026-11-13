# One harness per project

- Status: Implemented in the working tree; reconstructed design record, not release/deployment evidence.
- Recorded: 2026-11-14.
- Evidence: [server guide](../packages/server.md#data-and-hierarchy), [runtime baseline](server-runtime.md#harnesses), current source and associated tests.

## Problem and scope

Project conversations need a stable shared execution boundary while retaining independent histories and model choices.
The implementation reuses the existing project session identity rather than creating another Harness when a client requests a new project session.
This record describes the implemented boundary; it does not reconstruct undocumented original motivations.

## Goals and boundaries

- Repeated and concurrent project-session creation returns the existing session without resetting conversations or settings.
- New project conversations share session budgets, compaction and runtime policies while keeping separate histories, inboxes, models and tasks.
- Existing session URLs remain valid; legacy projects with multiple sessions retain their databases and routes.
- Automatic legacy consolidation, conversation filesystem isolation and changes to standalone-session ownership are outside this change.

## User journeys

| Given | When | Then |
| --- | --- | --- |
| A project already has a session and conversations | A client requests another project session, including concurrently | The existing identity is returned and retained settings/history are preserved. |
| A connected project is open | The user selects New conversation | A draft opens; backend conversation creation and message admission happen on first send. |
| A legacy project has multiple sessions | Its navigation is opened | Existing numbered groups and deep links remain accessible; new session creation reuses the first session. |
| Sibling conversations share a session | One conversation is stopped | That conversation is targeted; session-wide Stop is a separate operation affecting shared work. |

## Architecture and invariants

`Project → existing session ID → Durable Harness → conversations` remains the storage and URL relationship.
[HarnessService.ensureDefault/create](../../packages/server/src/harnesses/service.ts) resolves the first project session and initializes its root; [HarnessStore.insert](../../packages/server/src/harnesses/store.ts) rechecks existing project registrations inside a transaction.
This store guard preserves identity under competing creation requests; project-level service serialization also orders operations within the service.
Standalone creation retains its distinct ownership path.

Project conversation listings scan every metadata page while filtering owned/internal and archived conversations; they do not load every transcript.
Session budget and execution policies remain shared; conversational history and model selection remain per conversation.
Forking or opening another conversation does not itself create an isolated checkout.

## Compatibility and alternatives

The code preserves legacy multi-session state instead of merging checkpoint databases.
This is an observed compatibility decision; the repository does not contain a complete historical alternatives discussion, so none is invented here.
A future consolidation would need a separate design covering identity references, inherited history, task ownership, migration and recovery.

## Implementation ownership

| File | Responsibility |
| --- | --- |
| [harnesses/service.ts](../../packages/server/src/harnesses/service.ts) | Reuses the project session, creates conversations and scans all conversation metadata pages. |
| [harnesses/store.ts](../../packages/server/src/harnesses/store.ts) | Transactional reuse of an existing project registration before insertion. |
| [harnesses/routes.ts](../../packages/server/src/harnesses/routes.ts) | Retains the existing session API and conversation admission schemas. |
| [project-navigation.tsx](../../packages/web/src/components/projects/project-navigation.tsx) | Offers New conversation without a New session action. |
| [project-page.tsx](../../packages/web/src/components/projects/project-page.tsx) | Uses the conversation-draft action in the project workspace. |
| [use-project-navigation.ts](../../packages/web/src/components/sessions/use-project-navigation.ts) | Navigates to a scoped draft without creating a backend entity on click. |
| [capabilities.ts](../../packages/web/src/lib/capabilities.ts) | Removes the New session capability entry. |

## Verification and maintenance

[Harness tests](../../packages/server/test/harnesses.test.ts) cover project-session reuse, competing creation and retained state; [conversation creation](../../packages/server/test/conversation-creation.test.ts), [configuration](../../packages/server/test/conversation-configuration.test.ts), [names](../../packages/server/test/conversation-names.test.ts) and [runtime defaults](../../packages/server/test/runtime-defaults.test.ts) cover related boundaries.
These are verification entry points, not a claim that application tests ran during this documentation refactor.
Application changes require the checks in [Development](../development.md); update this record and the package guides when ownership or compatibility changes.
