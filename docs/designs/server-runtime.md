# Server runtime baseline

- Status: Implemented baseline, reconstructed on 2026-11-14; not a new implementation proposal.
- Evidence: current source and the generated directory contracts; historical choices are not inferred from code.

Backend ownership, persistence, execution and HTTP contracts reconstructed from the current source tree.
See the [behavior/development guide](../packages/server.md) for operational details and [coverage index](coverage.md) for file ownership.

## Scope and rationale

This document preserves current component contracts in one place so future work can load the relevant subsystem without scanning a README hierarchy.
It records observed behavior; it does not claim to reconstruct undocumented historical alternatives or prove runtime correctness.

## Package

Source root: `packages/server`.

### Package overview

Private `@console/server` package for the Fastify API, persistent backend state and Durable agent execution.

### Package interface

- `package.json` exposes `dev`, `build`, `start`, `typecheck`, `test` and `access` scripts; the package uses ES modules and requires Node.js 24.12.0 or newer.
- Shared schemas come from `@console/contracts`; runtime integration uses the pinned Pi/Durable ecosystem rather than locally defining its storage or model protocols.

### Package invariants

- `tsconfig.build.json` compiles production `src/**/*.ts` into `dist`; `tsconfig.json` also includes tests for type checking.
- `src/main.ts` owns production process startup and shutdown; `createApp` supports explicitly injected services for isolated app instances.

### Package side effects

- `build` removes and regenerates `dist`; `start` executes the built entrypoint, which opens backend storage and listens for HTTP requests.
- `access` executes the local credential-management CLI; runtime tools and workflows can mutate their selected workspaces and call external services.

### Package verification

Run from the repository root: `pnpm --filter @console/server test`.

Application changes also require `pnpm typecheck`, `pnpm test` and `pnpm build` as defined in `docs/development.md`.

## Composition

Source root: `packages/server/src`.

### Composition overview

Fastify composition and the production startup/shutdown boundary for backend-owned storage and Durable execution.

### Composition interface

- `createApp` in `app.ts` accepts optional provider/project/harness services, Fastify options and an HTTP policy, returning an app suitable for isolated tests.
- `main.ts` composes persistent services, optional bearer access and startup HTTP configuration.

### Composition invariants

- `createApp` installs the command catalog before feature routes; workflow registration requires both harness and project services.
- `main.ts` claims the backend data directory before composing persistent services; signal shutdown is guarded against duplicate handling.
- `httpConfiguration` defaults to loopback and requires authenticated policy for wildcard binding; CORS and bearer authorization remain separate checks.

### Composition side effects

- `main.ts` opens databases, reads `http.json`, optionally starts access revocation polling and listens on the configured address.
- `createApp` starts harness recovery and workflow scheduling through ready hooks and closes services through lifecycle hooks.
- Failure of `app.listen` and SIGINT/SIGTERM close the app and release the instance claim; service-construction and HTTP-configuration errors occur before that cleanup block. Production logging redacts authorization headers and pairing codes.

### Composition verification

Run from the repository root: `pnpm --filter @console/server test`.

### Composition source files

- [app.ts](../../packages/server/src/app.ts): Exports `createApp`.
- [main.ts](../../packages/server/src/main.ts): Package or script entry point; behavior is described in this section.

## Access

Source root: `packages/server/src/access`.

### Access overview

Owner pairing and bearer-client access for an optionally authenticated backend.

### Access interface

- `HttpConfiguration`, `parseHttpConfiguration` and `httpConfiguration` load and validate startup policy (`configuration.ts`).
- `AccessService` manages invitations, clients, authorization and pairing/client routes; `cli.ts` provides `invite`, `list` and `revoke` commands.

### Access invariants

- `parseHttpConfiguration` requires authentication for wildcard binding and HTTPS or loopback HTTP origins; defaults remain `127.0.0.1:3000` with authentication disabled.
- `AccessService.invite` expires codes after ten minutes; `pair` consumes invitations atomically and stores only credential hashes.
- `AccessService.authorize` checks active bearer credentials except health, pairing, GitHub-hook admission and preflight requests; origin checks remain separate.
- `AccessService.register` returns 429 after ten pairing attempts per IP in a fixed 60-second window, or for a new IP when the 1,000-entry tracking map remains full after expired entries are removed.

### Access side effects

- `AccessService` writes SQLite access records and closes revoked client streams through a one-second poll.
- `cli.ts` opens the access database and prints results; pairing returns its bearer credential once.

### Access verification

Run from the repository root: `pnpm --filter @console/server test`.

### Access source files

- [cli.ts](../../packages/server/src/access/cli.ts): Package or script entry point; behavior is described in this section.
- [configuration.ts](../../packages/server/src/access/configuration.ts): Exports `HttpConfiguration`, `parseHttpConfiguration`, `httpConfiguration`.
- [service.ts](../../packages/server/src/access/service.ts): Exports `AccessService`.

## Execution

Source root: `packages/server/src/execution`.

### Execution overview

Host, SSH and Linux sandbox environments injected into Durable tools.

### Execution interface

- `ExecutionEnvironmentFactory` and `localEnvironment` select a local Pi environment (`environment.ts`).
- `RemoteWorkspaceDoc`, `SshConfiguration`, `parseSshConfiguration` and `RemoteWorkspaces` manage conversation SSH profiles (`remote-workspaces.ts`).
- `SandboxDoc` and `WorkspaceSandboxes` manage per-conversation writable/read-only environments (`sandbox.ts`).

### Execution invariants

- `parseSshConfiguration` permits at most sixteen profiles and requires absolute workspace and trusted-host file paths.
- `RemoteWorkspaces.environment` rejects unavailable directories and Windows targets; it does not synchronize project checkouts.
- `WorkspaceSandboxes.open` requires Linux and rejects protected-directory overlap; cache identity includes canonical path, device, inode and read-only mode.

### Execution side effects

- `RemoteWorkspaces.environment` opens cached SSH connections; reload and close release them.
- `WorkspaceSandboxes` launches `/usr/bin/bwrap` with isolated namespaces, a cleared environment, temporary home/files and read-only system mounts; the checkout mount follows the requested access mode.

### Execution verification

Run from the repository root: `pnpm --filter @console/server test`.

### Execution source files

- [environment.ts](../../packages/server/src/execution/environment.ts): Exports `ExecutionEnvironmentFactory`, `localEnvironment`.
- [remote-workspaces.ts](../../packages/server/src/execution/remote-workspaces.ts): Exports `RemoteWorkspaceDoc`, `SshConfiguration`, `parseSshConfiguration`, `RemoteWorkspaces`.
- [sandbox.ts](../../packages/server/src/execution/sandbox.ts): Exports `SandboxDoc`, `WorkspaceSandboxes`.

## Harnesses

Source root: `packages/server/src/harnesses`.

### Harnesses overview

Console's session index, conversation admission and lifecycle around the imported Durable runtime, with backend-owned execution policy and task extensions.

### Harnesses interface

- `HarnessService`, `HarnessError` and `canContinue` own session/conversation commands, scoped configuration, task inspection and recovery (`service.ts`); `registerHarnessRoutes` owns their HTTP schemas and SSE transport (`routes.ts`).
- `HarnessRuntime` composes Durable storage, models, environments and extension registries (`runtime.ts`); `HarnessStore`, `HarnessRecord`, `RuntimeDefaults`, `standaloneOwner` and `harnessDataPath` provide Console's index/preferences (`store.ts`).
- `ConversationInfo` and `SessionInfo` store Console labels/creation identities; `ConversationArchive` and `ConversationArchives` own archive tombstones (`documents.ts`, `conversation-archives.ts`).
- `ConfigurationChange`, `contextRetention` and `conversationConfiguration` project editable configuration; `RuntimePolicy`, `runtimePolicySchema` and `runtimeSettings` describe session runtime overrides (`configuration.ts`, `runtime-policy.ts`).
- `AgentProfile`/`agentProfileSchema` and `ReviewerProfile`/`reviewerProfileSchema` define saved role settings; `defaultWorkspaceGuidance` and `defaultInspectionGuidance` supply machine defaults.
- `BackgroundJob`, `BackgroundJobInput`, `BackgroundJobEntry`, `BackgroundJobExtension`, `createBackgroundJobExtension` and `captureJobAgent` implement captured worker jobs (`background-job.ts`).
- `BackgroundReview`, `BackgroundReviewInput`, `BackgroundReviewEntry`, `BackgroundReviewExtension`, `ReviewDelivery` and `ReviewRequests` implement scheduled reviewer ownership and delivery (`background-review.ts`).
- `RecurringJob`/`RecurringJobExtension`/`JobRecurrence` and `RecurringReview`/`RecurringReviewExtension`/`ReviewRecurrence` implement bounded fixed-delay schedules.
- `agentControlExtensionName`, `PersistentAgents`, `PersistentAgent`, `AgentRequests`, `AgentReportEntry`, `AgentAnchor`, `AgentReporter`, `PersistentAgentExtension`, `createPersistentAgent` and `admitAgentMessage` retain named agents (`persistent-agents.ts`); `backgroundAgent`, `stopBackgroundAgent` and `AgentControlExtension` expose their tools (`agent-tools.ts`).
- `ReviewPolicy`, `ReviewWorkspace`, `ReviewerAgent`, `reviewChild`, `reviewFindings`, `createReviewWorkspace`, `reviewWorkspace`, `createReviewExtension` and `ReviewExtension` implement foreground review (`reviewer.ts`).
- `PlanDoc`, `workspaceRead` and `PlanExtension` implement Plan mode (`plan.ts`); `PostRunDoc`, `PostRunEntry`, `RepairEntry`, `CheckRequestEntry`, `CheckTask` and `PostRunExtension` implement checks and bounded repairs (`post-run.ts`).
- `McpConfiguration`, `parseMcpConfiguration`, `McpTools` and `mcpExtensionName` manage host MCP access (`mcp-tools.ts`); `ExtensionConfiguration`, `parseExtensionConfiguration` and `ManagedExtensions` manage trusted bundles (`managed-extensions.ts`).
- `advancedToolsName`, `codeModeCalls`, `createAdvancedTools`, `selectAdvancedTools` and `selectExtensionTools` compose Code Mode and discovered tools (`advanced-tools.ts`).
- `AttachmentInput`, `AttachmentInfo`, `AttachedInput`, `AttachmentError`, `attachmentLimit`, `textLimit`, `prepareAttachments`, `attachedInput` and `readAttachment` validate/adapt admitted files (`attachments.ts`); `workspaceImages` processes workspace images (`images.ts`).
- `JobEnvironment`, `JobWorkspace` and `assertJobEnvironment` capture/revalidate worker execution policy; `budgetReached`, `usageTokens`, `exceedsBudget` and `budgetedRequests` enforce session request thresholds.
- `executionView`, `historyWindow`, `messages`, `taskGraphView`, `conversationView`, `submissionView`, `queueView` and `taskDiagnostic` build bounded client projections (`view.ts`, `queue.ts`, `task-diagnostics.ts`); `purgeConversation` performs the version-specific offline erasure adapter.

### Harnesses invariants

- `HarnessService.ensureDefault` and project session creation reuse the project's existing session; legacy multiple-session data remains intact rather than being consolidated.
- `HarnessService.addConversation` and message admission deduplicate their creation/request identities; independent conversations share session runtime policy and budget, while Durable owns transcripts and checkpoints.
- `HarnessService.configureConversation` checks revisions and applicable idle boundaries; worktree, sandbox, remote, MCP and managed-extension choices enforce their compatibility rules.
- `PlanExtension` and `workspaceRead` constrain Plan mode to workspace reads and plan submission; reviewers use workspace-scoped read tools rather than inheriting coding tools.
- `assertJobEnvironment` rejects changed directory/worktree/sandbox/remote policy instead of silently moving captured jobs to another workspace.
- `budgetedRequests` checks retained session usage before a new model request; requests already in flight can exceed the threshold.
- `PostRunExtension` schedules `CheckTask` through the run-end task hook after successful write/edit calls, any shell/MCP call (including failed/nested calls), every answered run with a selected trusted user extension, and repair or recheck requests, when a check command is configured; it admits bounded repairs. `BackgroundJob` waits for idle and marks success only with a written answer, no run failure and a passed latest check when a check exists.
- `RecurringJob` and `RecurringReview` schedule after successful completion, stop on failure/empty output and do not overlap or replay every missed interval.
- `executionView` exposes allowlisted execution state, excluding raw runtime errors; the SSE implementation applies connection, frame and slow-client bounds.
- `purgeConversation` requires the supported Durable SQLite schema; deleting archived history requires session maintenance and does not delete project source files.
- `purgeConversation` rejects surviving fork dependencies and retains structural conversation records and allocated IDs after history erasure.

### Harnesses side effects

- `HarnessStore` persists session associations, runtime defaults/policies and profile collections; `HarnessRuntime` opens Durable SQLite session storage and `HarnessService.start` resumes admitted work.
- Runtime extensions can invoke models, selected local/SSH/sandbox tools, MCP servers, trusted bundles and post-run shell checks; idempotent admission does not guarantee external effects or billing occur once.
- Background jobs, reviewers and persistent agents create owned conversations/tasks and deliver reports through durable entries and optional parent input.
- Archive/deletion mutate lifecycle records and retained history; runtime close/reload releases cached storage, environments and external connections.

### Harnesses verification

Run from the repository root: `pnpm --filter @console/server test`.

### Harnesses source files

- [advanced-tools.ts](../../packages/server/src/harnesses/advanced-tools.ts): Exports `advancedToolsName`, `codeModeCalls`, `createAdvancedTools`, `selectAdvancedTools`, `selectExtensionTools`.
- [agent-profiles.ts](../../packages/server/src/harnesses/agent-profiles.ts): Exports `AgentProfile`, `agentProfileSchema`.
- [agent-tools.ts](../../packages/server/src/harnesses/agent-tools.ts): Exports `backgroundAgent`, `stopBackgroundAgent`, `AgentControlExtension`.
- [attachments.ts](../../packages/server/src/harnesses/attachments.ts): Exports `attachmentLimit`, `textLimit`, `AttachmentInput`, `AttachmentInfo`, `AttachmentError`, `AttachedInput`, `prepareAttachments`, `attachedInput`, `readAttachment`.
- [background-job.ts](../../packages/server/src/harnesses/background-job.ts): Exports `captureJobAgent`, `BackgroundJobInput`, `BackgroundJobEntry`, `BackgroundJob`, `BackgroundJobExtension`, `createBackgroundJobExtension`.
- [background-review.ts](../../packages/server/src/harnesses/background-review.ts): Exports `ReviewDelivery`, `ReviewRequests`, `BackgroundReviewEntry`, `BackgroundReviewInput`, `BackgroundReview`, `BackgroundReviewExtension`.
- [configuration.ts](../../packages/server/src/harnesses/configuration.ts): Exports `contextRetention`, `ConfigurationChange`, `conversationConfiguration`.
- [conversation-archives.ts](../../packages/server/src/harnesses/conversation-archives.ts): Exports `ConversationArchive`, `ConversationArchives`.
- [documents.ts](../../packages/server/src/harnesses/documents.ts): Exports `ConversationInfo`, `SessionInfo`.
- [guidance.ts](../../packages/server/src/harnesses/guidance.ts): Exports `defaultWorkspaceGuidance`, `defaultInspectionGuidance`.
- [images.ts](../../packages/server/src/harnesses/images.ts): Exports `workspaceImages`.
- [job-workspace.ts](../../packages/server/src/harnesses/job-workspace.ts): Exports `JobEnvironment`, `JobWorkspace`, `assertJobEnvironment`.
- [managed-extensions.ts](../../packages/server/src/harnesses/managed-extensions.ts): Exports `ExtensionConfiguration`, `parseExtensionConfiguration`, `ManagedExtensions`.
- [mcp-tools.ts](../../packages/server/src/harnesses/mcp-tools.ts): Exports `mcpExtensionName`, `McpConfiguration`, `parseMcpConfiguration`, `McpTools`.
- [persistent-agents.ts](../../packages/server/src/harnesses/persistent-agents.ts): Exports `agentControlExtensionName`, `PersistentAgent`, `PersistentAgents`, `AgentRequests`, `AgentReportEntry`, `AgentAnchor`, `AgentReporter`, `createPersistentAgent`, `admitAgentMessage`, `PersistentAgentExtension`.
- [plan.ts](../../packages/server/src/harnesses/plan.ts): Exports `PlanDoc`, `workspaceRead`, `PlanExtension`.
- [post-run.ts](../../packages/server/src/harnesses/post-run.ts): Exports `PostRunDoc`, `PostRunEntry`, `RepairEntry`, `CheckRequestEntry`, `CheckTask`, `PostRunExtension`.
- [purge-conversation.ts](../../packages/server/src/harnesses/purge-conversation.ts): Exports `purgeConversation`.
- [queue.ts](../../packages/server/src/harnesses/queue.ts): Exports `queueView`.
- [recurring-job.ts](../../packages/server/src/harnesses/recurring-job.ts): Exports `JobRecurrence`, `RecurringJob`, `RecurringJobExtension`.
- [recurring-review.ts](../../packages/server/src/harnesses/recurring-review.ts): Exports `ReviewRecurrence`, `RecurringReview`, `RecurringReviewExtension`.
- [reviewer-profiles.ts](../../packages/server/src/harnesses/reviewer-profiles.ts): Exports `ReviewerProfile`, `reviewerProfileSchema`.
- [reviewer.ts](../../packages/server/src/harnesses/reviewer.ts): Exports `ReviewPolicy`, `ReviewWorkspace`, `ReviewerAgent`, `reviewChild`, `reviewFindings`, `createReviewWorkspace`, `reviewWorkspace`, `createReviewExtension`, `ReviewExtension`.
- [routes.ts](../../packages/server/src/harnesses/routes.ts): Exports `registerHarnessRoutes`.
- [runtime-policy.ts](../../packages/server/src/harnesses/runtime-policy.ts): Exports `RuntimePolicy`, `runtimeSettings`.
- [runtime.ts](../../packages/server/src/harnesses/runtime.ts): Exports `HarnessRuntime`.
- [service.ts](../../packages/server/src/harnesses/service.ts): Exports `canContinue`, `HarnessError`, `HarnessService`.
- [store.ts](../../packages/server/src/harnesses/store.ts): Exports `standaloneOwner`, `HarnessRecord`, `RuntimeDefaults`, `harnessDataPath`, `HarnessStore`.
- [task-diagnostics.ts](../../packages/server/src/harnesses/task-diagnostics.ts): Exports `taskDiagnostic`.
- [token-budget.ts](../../packages/server/src/harnesses/token-budget.ts): Exports `budgetReached`, `usageTokens`, `exceedsBudget`, `budgetedRequests`.
- [view.ts](../../packages/server/src/harnesses/view.ts): Exports `executionView`, `historyWindow`, `messages`, `taskGraphView`, `conversationView`, `submissionView`.

## Http

Source root: `packages/server/src/http`.

### Http overview

Connection policy and a command catalog collected from owning feature routes.

### Http interface

- `HttpConnectionPolicy`, `localConnectionPolicy` and `configureHttpConnection` define origins, headers and optional authorization (`connection.ts`).
- `configureHttpConnection` registers `/health` and `/v1/connection`; `registerCommandCatalog` registers `/v1/commands` (`commands.ts`).
- `FastifyContextConfig.consoleCommand` tags routes with command IDs and server scopes; descriptors use `@console/contracts` types.

### Http invariants

- `configureHttpConnection` rejects supplied browser origins outside the policy and installs an optional authorization hook before feature handlers.
- `registerCommandCatalog` rejects duplicate command IDs and derives method, path and input schema from actual registered routes.

### Http side effects

- `configureHttpConnection` installs CORS/request hooks and returns the supplied or generated backend identity.
- `registerCommandCatalog` and `configureHttpConnection` mark catalog/connection responses as uncached.

### Http verification

Run from the repository root: `pnpm --filter @console/server test`.

### Http source files

- [commands.ts](../../packages/server/src/http/commands.ts): Exports `registerCommandCatalog`.
- [connection.ts](../../packages/server/src/http/connection.ts): Exports `HttpConnectionPolicy`, `localConnectionPolicy`, `configureHttpConnection`.

## Projects

Source root: `packages/server/src/projects`.

### Projects overview

Directory registrations, project defaults, Git metadata and bounded create/clone setup.

### Projects interface

- `Project`, `ProjectAgentSettings`, `ProjectStore` and `projectDatabasePath` define persisted registration and settings (`store.ts`).
- `ProjectService` manages settings, registration, metadata, setup and archive/restore; `ProjectError` carries HTTP status and optional error code (`service.ts`, `errors.ts`).
- `registerProjectRoutes` owns project and machine-project-root HTTP schemas (`routes.ts`).
- `Setup`, `GitRunner` and `setupProject` implement staging and publication (`setup.ts`); `publicRepository`, `gitEnvironment` and `runGit` bound Git execution (`git.ts`).
- `GitWorktree`, `GitMetadata`, `inspectGit` and `linkedWorktreePath` expose metadata and validate existing linked checkouts (`git-metadata.ts`).

### Projects invariants

- `ProjectService.register` canonicalizes accessible directories; `ProjectStore.insert` enforces unique paths, including archived registrations.
- `ProjectService.update` edits name/icon/color without changing paths; `archive` runs its lifecycle callback before hiding a registration and does not delete source files.
- `ProjectService.setup` permits at most two concurrent operations with a two-minute timeout; route disconnect aborts setup.
- `setupProject` rejects occupied destinations and publishes from a temporary staging directory; published files survive registration failure.
- `publicRepository` permits credential-free HTTPS URLs; `runGit` disables inherited Git credentials/configuration, hooks, redirects and non-HTTPS transports.
- `linkedWorktreePath` requires an existing, non-prunable linked checkout in the project's repository; it creates no worktrees.

### Projects side effects

- `ProjectStore` creates/migrates `projects`, `machine_settings` and `project_agent_settings` tables and persists registration/settings lifecycle changes.
- `setupProject` may create parents, clone/init Git, publish files and remove staging files; `runGit` starts and cancels child processes.
- `inspectGit` runs bounded Git metadata subprocesses; `ProjectService.close` cancels setup and waits for lifecycle work before closing storage.

### Projects verification

Run from the repository root: `pnpm --filter @console/server test`.

### Projects source files

- [errors.ts](../../packages/server/src/projects/errors.ts): Exports `ProjectError`.
- [git-metadata.ts](../../packages/server/src/projects/git-metadata.ts): Exports `GitWorktree`, `GitMetadata`, `inspectGit`, `linkedWorktreePath`.
- [git.ts](../../packages/server/src/projects/git.ts): Exports `publicRepository`, `gitEnvironment`, `runGit`.
- [routes.ts](../../packages/server/src/projects/routes.ts): Exports `registerProjectRoutes`.
- [service.ts](../../packages/server/src/projects/service.ts): Exports `ProjectService`.
- [setup.ts](../../packages/server/src/projects/setup.ts): Exports `Setup`, `GitRunner`, `setupProject`.
- [store.ts](../../packages/server/src/projects/store.ts): Exports `ProjectAgentSettings`, `Project`, `projectDatabasePath`, `ProjectStore`.

## Providers

Source root: `packages/server/src/providers`.

### Providers overview

Pi AI provider catalogs, backend credentials, login prompts, enablement and model favorites.

### Providers interface

- `ProviderStore` implements Pi AI's `CredentialStore` and exposes a `ModelsStore` adapter; `providerDatabasePath` selects persistent storage (`store.ts`).
- `ProviderService`, `ProviderError` and `LoginView` provide catalog/model views, favorite selection and API-key/OAuth lifecycle (`service.ts`).
- `registerProviderRoutes` owns provider, login and favorite HTTP schemas (`routes.ts`); provider/model definitions come from `@earendil-works/pi-ai`.

### Providers invariants

- `ProviderService` disables SDK environment/file credential discovery; saved backend credentials supply authentication.
- `ProviderService.start` permits one pending login per provider, expires it after ten minutes and validates answers against the current prompt identity.
- `ProviderService.enable` requires a saved credential; `favorites` returns only favorite models currently reported available by enabled providers.
- `ProviderStore` serializes credential/catalog updates; `modify` commits or rolls back its transaction.
- `registerProviderRoutes` returns controlled error messages instead of SDK/storage errors or submitted secrets; catalog state does not establish successful upstream inference.

### Providers side effects

- `ProviderStore` creates `providers`, `favorites`, `catalogs` and `settings` tables, stores credentials as JSON and retains a backend installation UUID; filesystem privacy comes from `openDatabase`.
- `ProviderService.start` and `refresh` invoke SDK authentication/catalog operations; login flows use timers and cancellation signals.
- `ProviderService.remove` deletes credentials, favorites and cached catalog; `close` cancels login flows before closing storage.

### Providers verification

Run from the repository root: `pnpm --filter @console/server test`.

### Providers source files

- [routes.ts](../../packages/server/src/providers/routes.ts): Exports `registerProviderRoutes`.
- [service.ts](../../packages/server/src/providers/service.ts): Exports `ProviderError`, `LoginView`, `ProviderService`.
- [store.ts](../../packages/server/src/providers/store.ts): Exports `providerDatabasePath`, `ProviderStore`.

## Storage

Source root: `packages/server/src/storage`.

### Storage overview

Private SQLite databases, backend process ownership and revision-protected owner configuration.

### Storage interface

- `openDatabase` opens Node SQLite storage (`database.ts`).
- `claimInstance` claims a data directory and returns an idempotent release function (`instance-lock.ts`).
- `ConfigurationFileError`, `ConfigurationSnapshot` and `OwnerConfiguration` provide validated configuration read/replace with activation callbacks (`owner-configuration.ts`).

### Storage invariants

- `claimInstance` holds an exclusive transaction with zero busy timeout, rejecting a competing process until release or process death.
- `OwnerConfiguration.read` rejects links, nonregular files, files over 64 KiB and unsafe Unix ownership/permissions; missing files have revision `missing`, malformed contents produce an invalid snapshot.
- `OwnerConfiguration.replace` serializes saves and checks byte-derived revisions before replacement; stale saves fail with 409.

### Storage side effects

- `openDatabase` creates private parent directories/databases and configures a five-second SQLite busy timeout.
- `OwnerConfiguration.replace` writes a private temporary file, fsyncs, renames, fsyncs the directory and activates the configuration.
- `claimInstance` opens `instance.sqlite`; release closes its database.

### Storage verification

Run from the repository root: `pnpm --filter @console/server test`.

### Storage source files

- [database.ts](../../packages/server/src/storage/database.ts): Exports `openDatabase`.
- [instance-lock.ts](../../packages/server/src/storage/instance-lock.ts): Exports `claimInstance`.
- [owner-configuration.ts](../../packages/server/src/storage/owner-configuration.ts): Exports `ConfigurationFileError`, `ConfigurationSnapshot`, `OwnerConfiguration`.

## Workflows

Source root: `packages/server/src/workflows`.

### Workflows overview

Versioned project workflows compose Durable background jobs, forward-only conditions and revision-bound owner approvals.

### Workflows interface

- `WorkflowService`, `validateDefinition` and `nextCron` manage definitions, run admission, approvals, history and trigger scheduling (`service.ts`).
- `WorkflowRuns`, `WorkflowInput`, `WorkflowRun`, `interpolate`, `approvalRevision` and `createWorkflowExtension` define durable execution and approval state (`task.ts`).
- `GitHubActions.verify` and `merge` implement declared PR actions (`github.ts`); `registerWorkflowRoutes` owns workflow/run and signed GitHub-hook HTTP schemas (`routes.ts`).
- Workflow schemas/types come from `@console/contracts`; agent steps use the harness `BackgroundJob` task rather than a separate execution engine.

### Workflows invariants

- `validateDefinition` requires unique step IDs, forward-only transitions and conditions referencing earlier agent steps.
- `WorkflowService.save` checks project/conversation scope and current revision, adding a new immutable version; admission snapshots definition, inputs and captured worker policy.
- `WorkflowService.start` deduplicates request identities in persistent admissions and Durable request documents; external effects can still repeat after interruption.
- `WorkflowService.decide` checks the pending revision and preserves actor/time/action receipts; rejection stops downstream work and invalidation replaces the pending revision.
- `GitHubActions.verify` requires the reviewed full head SHA; `merge` verifies again, supplies the expected SHA and recognizes an already merged matching PR.
- `nextCron` requires five fields and an IANA timezone; `WorkflowService.tick` skips overlapping runs and advances overdue schedules to the next future occurrence.
- `registerWorkflowRoutes` verifies the exact raw webhook bytes with `CONSOLE_GITHUB_WEBHOOK_SECRET` before matching repository/event/action and using the delivery identity for admission.

### Workflows side effects

- `WorkflowService` writes `workflows`, `workflow_versions` and `workflow_admissions` in the harness index database; Durable persists task checkpoints, outputs and approval receipts.
- `WorkflowRun` creates owned background jobs that can execute the captured tools and checks against the selected workspace.
- `GitHubActions` calls GitHub using backend `CONSOLE_GITHUB_TOKEN`; approved merge steps can merge pull requests.
- `WorkflowService.startScheduler` installs a one-second timer; `close` stops it and awaits an in-flight tick.

### Workflows verification

Run from the repository root: `pnpm --filter @console/server test`.

### Workflows source files

- [github.ts](../../packages/server/src/workflows/github.ts): Exports `GitHubActions`.
- [routes.ts](../../packages/server/src/workflows/routes.ts): Exports `registerWorkflowRoutes`.
- [service.ts](../../packages/server/src/workflows/service.ts): Exports `nextCron`, `validateDefinition`, `WorkflowService`.
- [task.ts](../../packages/server/src/workflows/task.ts): Exports `WorkflowRuns`, `WorkflowInput`, `interpolate`, `approvalRevision`, `WorkflowRun`, `createWorkflowExtension`.
