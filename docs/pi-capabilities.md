# Pi integration scope

The [Console feature inventory](features.md) is the single implementation checklist for Pi,
host execution and Console's own features. This page records compatibility boundaries rather
than duplicating feature statuses.

## Upstream surfaces

- Pi AI provides model access, provider/auth catalogs and multimodal services.
- Pi Durable provides conversations, tasks, documents, hooks and recovery primitives.
- Pi CLI adds its own resource loader, plugins, configuration and terminal interfaces.
- disler's Durable Pi application demonstrates additional product integrations, not features
  that Console receives by installing the runtime.

Baseline: Console pins Pi packages to 1.4.0. The user selected equivalent Console features on
its Durable runtime; unchanged Pi CLI plugin/config-file compatibility is not required. Prefer
native APIs and explicit adapters. Dependency support is not a completed Console integration;
backend and browser changes must ship together when both are needed.

The [backend adapter audit](adapter-audit.md) records simplification candidates and retirement
conditions against the pinned APIs. Its original sandbox recommendations were superseded by the maintainer's direct-host decision;
feature status remains in the inventory.

| Capability area | Authoritative status |
| --- | --- |
| Providers, models and multimodal services | [Model access and content](features.md#model-access-and-content) |
| Filesystem, commands and network authority | [Sandboxing and execution authority](features.md#sandboxing-and-execution-authority) |
| Steering, compaction, history, output and recovery | [Agent runtime, history and recovery](features.md#agent-runtime-history-and-recovery) |
| Instructions, skills, templates, extensions, hooks, MCP and Code Mode | [Resources and extensibility](features.md#resources-and-extensibility) |
| Subagents, shared state, plans, jobs and approvals | [Coordination and durable workflows](features.md#coordination-and-durable-workflows) |
| Clients, streaming and operations | [Web, other clients and operations](features.md#web-other-clients-and-operations) |

## Adapter and trust boundaries

Pi CLI and Pi Durable extensions have different host APIs. Demonstrate compatibility per
adapter. Executing a CLI extension in the credential-owning backend does not establish
Durable extension compatibility.

The current resource adapter executes no project code. It reads bounded Markdown directly on the host
inside the configured project, skips symlinks and does not scan the personal home or ancestors
above the workspace. Skill names come from directories; template names from Markdown filenames.
SYSTEM/APPEND_SYSTEM add scoped prompt sections. Indexing bounds are not tool confinement.
Registering a workspace or discovering resources grants no executable-plugin authority.

Durable storage preserves runtime records; it does not automatically implement exactly-once
external effects, production backup/restore, background-agent messaging or human approval gates.
Keep those product integrations and their verification gaps explicit in the feature inventory.

Deployment, publishing, external messages, credential grants and irreversible operations still
require their normal authorization. Implementing a control does not authorize its use against
the user's infrastructure. Terminal appearance and alternative storage engines are separate
compatibility targets, not required web-product parity.
