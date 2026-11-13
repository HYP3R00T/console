# Shared contracts baseline

- Status: Implemented baseline, reconstructed on 2026-11-14; not a new implementation proposal.
- Evidence: current source and the generated directory contracts; historical choices are not inferred from code.

Shared command, configuration and workflow schemas consumed by both application packages.
See the [behavior/development guide](../packages/server.md#commands-and-scoped-settings) for operational details and [coverage index](coverage.md) for file ownership.

## Scope and rationale

This document preserves current component contracts in one place so future work can load the relevant subsystem without scanning a README hierarchy.
It records observed behavior; it does not claim to reconstruct undocumented historical alternatives or prove runtime correctness.

## Package

Source root: `packages/contracts`.

### Package overview

The private @console/contracts workspace package exports TypeScript source directly through src/index.ts.

### Package invariants

- `package.json:exports` points to `./src/index.ts`; this package defines no independent build or test scripts.

### Package side effects

- None; consuming packages own runtime validation and persistence.

### Package verification

- Run `pnpm test` from the repository root.

## Schemas and types

Source root: `packages/contracts/src`.

### Schemas and types overview

JSON schemas and TypeScript types shared by the server and browser; consumers perform validation and execution.

### Schemas and types interface

- [index.ts](../../packages/contracts/src/index.ts): `Scope`, `CommandDescriptor`, `CommandCatalog`, `revisionSchema`, `contextRetention`, `toolSelection`, `instructions`, `conversationConfigurationSchema`, `workspaceGuidanceSchema`, `projectAgentSettingsSchema`, `sessionRuntimeSettingsSchema`, `SettingMetadata`, `settingMetadata`.
- [runtime-policy.ts](../../packages/contracts/src/runtime-policy.ts): `runtimePolicySchema`.
- [workflows.ts](../../packages/contracts/src/workflows.ts): `WorkflowStep`, `WorkflowDefinition`, `WorkflowVersion`, `WorkflowRunView`, `workflowDefinitionSchema`.

### Schemas and types invariants

- `index.ts:conversationConfigurationSchema` requires a 64-character hexadecimal revision and rejects additional properties; tool selection distinguishes null defaults from an explicit empty array.
- `index.ts:workspaceGuidanceSchema`, `projectAgentSettingsSchema` and `sessionRuntimeSettingsSchema` constrain writes to their owning scope; `settingMetadata` records propagation and idle requirements.
- `runtime-policy.ts:runtimePolicySchema` bounds retry, stream, retention and compaction values and rejects unknown policy fields.
- `workflows.ts:workflowDefinitionSchema` accepts 1–50 agent, condition or approval steps; GitHub triggers allow issues or pull_request events. Graph consistency is validated by server consumers.

### Schemas and types side effects

- None; these modules export data and types without I/O.

### Schemas and types verification

- Run `pnpm test` from the repository root.
