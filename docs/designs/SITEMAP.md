# Design index

Current behavior lives in the package guides; these documents supply subsystem contracts and decision records.
Reconstructed baselines describe implemented source and have not been retroactively approved as original proposals.
[Coverage](coverage.md) links source files to owning sections; [template](TEMPLATE.md) provides the structure for new proposals.

| Document | Status | Components and purpose |
| --- | --- | --- |
| [Server runtime](server-runtime.md) | Implemented baseline | Backend composition, storage, providers, projects, execution and Durable contracts. |
| [Web client](web-client.md) | Implemented baseline | Browser transport, client state, components and route entry points. |
| [Shared contracts](shared-contracts.md) | Implemented baseline | Shared schemas, scopes, command descriptors and setting metadata. |
| [Development tooling](development-tooling.md) | Implemented baseline | Workspace/build configuration, scripts, CI, tests and dependency patches. |
| [One harness per project](project-harness.md) | Implemented record | Shared project runtime identity, conversation creation and legacy compatibility. |
| [Workflow execution](workflow-execution.md) | Implemented record | Versioned workflows, durable jobs, approvals, triggers and recovery. |

## Change lifecycle

1. Read the relevant baseline and current guide; define the problem, acceptance criteria and boundaries.
2. Draft a focused feature design with decisions, alternatives, exact files and verification.
3. Use fresh-context review for consequential or uncertain designs; resolve material findings in the design and record approval explicitly.
4. Implement in reviewable phases and run the checks required by [Development](../development.md).
5. Update implementation status, affected guides/baselines and coverage with the same change; link replacements instead of leaving competing active specifications.

Small mechanical fixes can update the owning contract directly; they do not need a new design document.
