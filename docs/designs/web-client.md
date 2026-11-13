# Web client baseline

- Status: Implemented baseline, reconstructed on 2026-11-14; not a new implementation proposal.
- Evidence: current source and the generated directory contracts; historical choices are not inferred from code.

Browser ownership, route composition, feature components and client services reconstructed from the current source tree.
See the [behavior/development guide](../packages/web.md) for operational details and [coverage index](coverage.md) for file ownership.

## Scope and rationale

This document preserves current component contracts in one place so future work can load the relevant subsystem without scanning a README hierarchy.
It records observed behavior; it does not claim to reconstruct undocumented historical alternatives or prove runtime correctness.

## Package

Source root: `packages/web`.

### Package overview

The @console/web package is a Next.js browser client for independently connected Console backends. The [Web guide](../packages/web.md) describes user-facing behavior and [Development](../development.md) defines tooling and checks.

### Package interface

- `package.json:scripts`: dev/start bind 127.0.0.1:3001; build runs next build; typecheck runs next typegen and tsc --noEmit; test runs node --test test/*.test.ts.
- [next.config.ts](../../packages/web/next.config.ts): nextConfig disables agentRules.
- [postcss.config.mjs](../../packages/web/postcss.config.mjs): enables the @tailwindcss/postcss plugin.

### Package invariants

- `src/lib/connection.ts:backendOrigin` requires remote HTTPS or loopback HTTP, and `src/lib/backend/local-http.ts:localHttpConnector` binds requests to the connected origin.
- `src/lib/configuration/store.ts:parseBackup` validates client backup data and strips imported backend identities; origin-scoped access tokens are managed separately in `src/lib/backend/auth.ts`.

### Package side effects

- The client performs backend HTTP/SSE requests and stores browser preferences and tab-session credentials; rendering and command handling are implemented in src.
- Package dev/start scripts launch servers, build creates Next output and typecheck generates route types; follow owner-server rules before running development commands.

### Package verification

- From the repository root, run `pnpm --filter @console/web test`, `pnpm --filter @console/web typecheck` and `pnpm --filter @console/web build` for application changes.
- For documentation-only changes, use explicit-file RumDL/Prek checks and local-link verification as specified in Development.

## Source boundaries

Source root: `packages/web/src`.

### Source boundaries overview

Browser application entry points, React components and client services; Next App Router supplies routing and the backend owns agent execution.

### Source boundaries invariants

- `lib/backend/connection-manager.ts:ConnectionManager` retains independent client lifetimes per bookmark and rejects mismatched installation identities.
- `lib/configuration/store.ts:ConfigurationStore` owns browser preferences; backend and conversation state remain outside preference backups.

### Source boundaries side effects

- Child services issue backend HTTP/SSE requests, update browser storage and notify React subscribers; route wrappers redirect legacy destinations.

### Source boundaries verification

- Run `pnpm --filter @console/web test` from the repository root.

## App Router

Source root: `packages/web/src/app`.

### App Router overview

Next App Router entry points and their child route boundaries.

### App Router interface

- [layout.tsx](../../packages/web/src/app/layout.tsx): `RootLayout` renders `ThemeProvider`, `Toaster`, `ConnectionProvider`, `DeviceProvider`, `ProvidersProvider`, `ProjectsProvider`, `ConversationPreferences`, `TooltipProvider`, `NavigationMemoryProvider`, `AppShell`.
- [page.tsx](../../packages/web/src/app/page.tsx): `Page` renders `Home`.

### App Router invariants

- `layout.tsx:RootLayout` nests connection, device, provider, project, conversation-preference and navigation contexts around AppShell; metadata identifies Console.

### App Router side effects

- `layout.tsx` configures Inter and `RootLayout` renders global theme/toast/context providers; their operational effects are owned by component contracts.

### App Router verification

- Run `pnpm --filter @console/web test` from the repository root.

## Connection context

Source root: `packages/web/src/components`.

### Connection context overview

Client connection context and overview, with feature components grouped by responsibility.

### Connection context interface

- [connection-provider.tsx](../../packages/web/src/components/connection-provider.tsx): `ConnectionProvider`, `useConnections`, `useConnection`.
- [home.tsx](../../packages/web/src/components/home.tsx): `Home`.

### Connection context invariants

- `ConnectionProvider` creates one manager per mount; `useConnections` requires that provider (`connection-provider.tsx`).
- `useConnection` resolves explicit ID, route device ID, then disconnected fallback (`connection-provider.tsx`).

### Connection context side effects

- `ConnectionProvider` subscribes to manager state and closes its manager on unmount (`connection-provider.tsx`).

### Connection context verification

Run from the repository root:

```sh
pnpm --filter @console/web test
```

## Commands

Source root: `packages/web/src/components/commands`.

### Commands overview

Route-scoped command registration, palette discovery, appearance pickers and browser shortcut preferences.

### Commands interface

- [appearance-picker.tsx](../../packages/web/src/components/commands/appearance-picker.tsx): `AppearancePickerView`.
- [backend-commands.tsx](../../packages/web/src/components/commands/backend-commands.tsx): `BackendCommandsProvider`, `useBackendCommands`.
- [capability-directory.tsx](../../packages/web/src/components/commands/capability-directory.tsx): `CapabilityDirectory`.
- [command-palette.tsx](../../packages/web/src/components/commands/command-palette.tsx): `CommandActions`, `CommandPalette`.
- [command-registry.tsx](../../packages/web/src/components/commands/command-registry.tsx): `CommandRegistryProvider`, `useCommands`, `useRegisterCommands`.
- [conversation-commands.tsx](../../packages/web/src/components/commands/conversation-commands.tsx): `ConversationCommands`.
- [palette-browser.tsx](../../packages/web/src/components/commands/palette-browser.tsx): `PaletteFilter`, `PaletteBrowser`.
- [shortcut-preferences.tsx](../../packages/web/src/components/commands/shortcut-preferences.tsx): `ShortcutPreferences`, `useShortcutPreferences`.
- [use-palette-catalog.ts](../../packages/web/src/components/commands/use-palette-catalog.ts): `usePaletteCatalog`.

### Commands invariants

- `BackendCommandsProvider` accepts version-1 catalogs and known method/path mappings; a 404 selects legacy support (`backend-commands.tsx`).
- `useRegisterCommands` scopes registrations to the route and resolves current callbacks through a ref (`command-registry.tsx`).
- `CommandPalette` rejects deferred selections after route, URL or relevant-client changes (`command-palette.tsx`).
- `ShortcutPreferences` rereads persisted bindings before editing; `AppearancePickerView` clears owned previews on cleanup (`shortcut-preferences.tsx`, `appearance-picker.tsx`).

### Commands side effects

- `BackendCommandsProvider` fetches the command catalog; `usePaletteCatalog` loads destinations only while the palette is open (`backend-commands.tsx`, `use-palette-catalog.ts`).
- `CommandPalette` installs keyboard handling, invokes commands and defers selection actions until closing finishes (`command-palette.tsx`).
- `ShortcutPreferences` saves browser bindings; `AppearancePickerView` previews and saves appearance (`shortcut-preferences.tsx`, `appearance-picker.tsx`).
- `ConversationCommands` submits compaction and Plan changes and invokes supplied stop/continue handlers (`conversation-commands.tsx`).

### Commands verification

Run from the repository root:

```sh
pnpm --filter @console/web test
```

## Devices

Source root: `packages/web/src/components/devices`.

### Devices overview

Browser device bookmarks, connection actions, appearance editing and connection-status labels.

### Devices interface

- [device-icon.tsx](../../packages/web/src/components/devices/device-icon.tsx): `deviceColorClasses`, `DeviceIcon`.
- [device-provider.tsx](../../packages/web/src/components/devices/device-provider.tsx): `DeviceProvider`, `useDevices`.
- [edit-device-dialog.tsx](../../packages/web/src/components/devices/edit-device-dialog.tsx): `EditDeviceDialog`.
- [use-device-status.ts](../../packages/web/src/components/devices/use-device-status.ts): `useDeviceStatus`.

### Devices invariants

- `DeviceProvider` requires ready, error-free storage before editing bookmarks and validates replacement devices through `newDevice` (`device-provider.tsx`).
- `DeviceProvider` remembers connection choices only after successful connection and reconnects remembered saved devices at startup (`device-provider.tsx`).
- `useDevices` requires `DeviceProvider`; editing preserves unspecified appearance and disconnects the bookmark (`device-provider.tsx`).

### Devices side effects

- `DeviceProvider` reads/writes browser configuration, connects/disconnects clients and disconnects active entries on configuration import (`device-provider.tsx`).
- `DeviceProvider` clears tokens on removal or URL replacement; `EditDeviceDialog` optionally pairs before saving (`device-provider.tsx`, `edit-device-dialog.tsx`).

### Devices verification

Run from the repository root:

```sh
pnpm --filter @console/web test
```

## Layout

Source root: `packages/web/src/components/layout`.

### Layout overview

Application shell, machine rail, navigation controls, theme application and route-scoped workspace panels.

### Layout interface

- [app-shell.tsx](../../packages/web/src/components/layout/app-shell.tsx): `AppShell`.
- [app-sidebar.tsx](../../packages/web/src/components/layout/app-sidebar.tsx): `AppSidebar`.
- [connection-status.tsx](../../packages/web/src/components/layout/connection-status.tsx): `ConnectionStatus`.
- [control-tooltip.tsx](../../packages/web/src/components/layout/control-tooltip.tsx): `ControlTooltip`.
- [device-rail.tsx](../../packages/web/src/components/layout/device-rail.tsx): `DeviceRail`.
- [navigation-drag.tsx](../../packages/web/src/components/layout/navigation-drag.tsx): `useNavigationDrag`, `NavigationDragProvider`, `NavigationDropZone`.
- [navigation-memory.tsx](../../packages/web/src/components/layout/navigation-memory.tsx): `NavigationMemoryProvider`, `useNavigationMemory`, `useNavigationDisclosure`.
- [navigation-menu.tsx](../../packages/web/src/components/layout/navigation-menu.tsx): `useNavigationMenuOpen`, `NavigationAction`, `NavigationMenu`.
- [navigation-row.tsx](../../packages/web/src/components/layout/navigation-row.tsx): `NavigationRow`.
- [navigation-section.tsx](../../packages/web/src/components/layout/navigation-section.tsx): `NavigationSection`.
- [sidebar-action.tsx](../../packages/web/src/components/layout/sidebar-action.tsx): `SidebarAction`.
- [theme-provider.tsx](../../packages/web/src/components/layout/theme-provider.tsx): `ThemeProvider`, `useClientAppearance`.
- [workspace-chrome.tsx](../../packages/web/src/components/layout/workspace-chrome.tsx): `WorkspaceConversation`, `WorkspaceInspector`, `WorkspaceChromeProvider`, `useWorkspaceChrome`.
- [workspace-sidebar.tsx](../../packages/web/src/components/layout/workspace-sidebar.tsx): `WorkspaceSidebar`, `WorkspaceSidebarToggle`.

### Layout invariants

- `AppShell` uses chrome only for the current route; preferences suppress the inspector (`app-shell.tsx:ShellLayout`).
- `WorkspaceSidebar` exposes desktop content only when available, open and not overlaid; hidden content is inert, while overlays use sheets (`workspace-sidebar.tsx`).
- `NavigationDragProvider` requires a connected backend and the client captured at drag start; menu actions are filtered by entity support (`navigation-drag.tsx`, `navigation-menu.tsx:NavigationMenu`).
- `useNavigationDisclosure` honors saved disclosure state; failed configuration access preserves the applied theme (`navigation-memory.tsx`, `theme-provider.tsx:ThemeConfiguration`).

### Layout side effects

- `AppShell` registers shell/settings commands, handles responsive media and pointer resizing, and retains panel widths during its lifetime (`app-shell.tsx:ShellLayout`).
- `NavigationMemoryProvider` persists routes/disclosures; `NavigationDragProvider` updates pins and portals transient status (`navigation-memory.tsx`, `navigation-drag.tsx`).
- `ThemeProvider` applies root CSS tokens and runtime mode and subscribes to configuration and temporary previews (`theme-provider.tsx:ThemeConfiguration`).

### Layout verification

Run from the repository root:

```sh
pnpm --filter @console/web test
```

## Projects

Source root: `packages/web/src/components/projects`.

### Projects overview

Backend-scoped project state, navigation, settings, Git inspection, setup, archives and workflow editing.

### Projects interface

- [project-archive.tsx](../../packages/web/src/components/projects/project-archive.tsx): `ProjectArchive`.
- [project-git.tsx](../../packages/web/src/components/projects/project-git.tsx): `ProjectGit`.
- [project-icon.tsx](../../packages/web/src/components/projects/project-icon.tsx): `ProjectIcon`, `ProjectIconPicker`.
- [project-navigation.tsx](../../packages/web/src/components/projects/project-navigation.tsx): `ProjectNavigation`.
- [project-page.tsx](../../packages/web/src/components/projects/project-page.tsx): `ProjectPage`.
- [project-removal-dialog.tsx](../../packages/web/src/components/projects/project-removal-dialog.tsx): `ProjectRemovalDialog`.
- [project-settings.tsx](../../packages/web/src/components/projects/project-settings.tsx): `ProjectSettings`.
- [project-setup.tsx](../../packages/web/src/components/projects/project-setup.tsx): `ProjectSetup`.
- [project-workflows.tsx](../../packages/web/src/components/projects/project-workflows.tsx): `ProjectWorkflows`.
- [projects-provider.tsx](../../packages/web/src/components/projects/projects-provider.tsx): `Project`, `MachineSettings`, `ProjectsProvider`, `useMachineProjects`.

### Projects invariants

- `ProjectsProvider` publishes only the latest refresh for the matching client/origin; `useMachineProjects` requires the saved device URL to match (`projects-provider.tsx`).
- `ProjectsProvider` pin changes require loaded, error-free pin storage and remain origin-scoped (`projects-provider.tsx`).
- `ProjectWorkflows` accepts object inputs containing string values and retains an admission request ID for unchanged workflow/version/input until success (`project-workflows.tsx`).
- `WorkflowEditor` saves with a revision, limits its controls to 1–50 steps and offers later-step/finish destinations (`project-workflows.tsx`).

### Projects side effects

- `ProjectsProvider` polls project/settings state every ten seconds and writes browser project pins; `ProjectGit` loads backend Git metadata (`projects-provider.tsx`, `project-git.tsx`).
- `ProjectSetup`, `ProjectSettings` and the `ProjectPage` editor create/register/clone projects or save backend settings, then refresh or navigate (`project-setup.tsx`, `project-settings.tsx`, `project-page.tsx:ProjectEditor`).
- `ProjectRemovalDialog` archives or explicitly stops and archives busy projects; `ProjectArchive` restores them (`project-removal-dialog.tsx`, `project-archive.tsx`).
- `ProjectWorkflows` polls every two seconds, saves versions, admits/stops runs and posts revision-bearing approval/invalidation actions (`project-workflows.tsx`).

### Projects verification

Run from the repository root:

```sh
pnpm --filter @console/web test
```

## Providers

Source root: `packages/web/src/components/providers`.

### Providers overview

Backend provider configuration, login flows, model catalogs and model favorites.

### Providers interface

- [model-details.tsx](../../packages/web/src/components/providers/model-details.tsx): `ModelDetails`.
- [provider-login.tsx](../../packages/web/src/components/providers/provider-login.tsx): `ProviderLogin`.
- [provider-settings.tsx](../../packages/web/src/components/providers/provider-settings.tsx): `ProviderSettings`.
- [providers-provider.tsx](../../packages/web/src/components/providers/providers-provider.tsx): `ProvidersProvider`, `useProviders`.

### Providers invariants

- `ProvidersProvider` publishes only the latest refresh for the current client/origin and validates provider-list and active-count shape (`providers-provider.tsx`).
- `ProviderSettings` requires the selected saved device to match the current origin; model results are scoped to the selected provider (`provider-settings.tsx`).
- `ProviderLogin` links only HTTPS URLs and associates answers with the current prompt ID (`provider-login.tsx:safeUrl`).

### Providers side effects

- `ProvidersProvider` polls overview every ten seconds; `ProviderSettings` loads models, starts logins, changes enablement, removes providers and updates catalogs/favorites through backend requests (`providers-provider.tsx`, `provider-settings.tsx:ProviderSettingsContent`).
- `ProviderLogin` polls pending logins every 600 ms, posts answers and deletes a pending flow when closed (`provider-login.tsx`).

### Providers verification

Run from the repository root:

```sh
pnpm --filter @console/web test
```

## Sessions

Source root: `packages/web/src/components/sessions`.

### Sessions overview

Conversation state and transcript presentation, drafts, chat controls, inspector settings and background work controls.

### Sessions interface

- [agent-profile-picker.tsx](../../packages/web/src/components/sessions/agent-profile-picker.tsx): `AgentProfilePicker`.
- [attachment-list.tsx](../../packages/web/src/components/sessions/attachment-list.tsx): `DraftAttachments`, `MessageAttachment`, `MessageAttachments`.
- [attachments.ts](../../packages/web/src/components/sessions/attachments.ts): `ChatAttachment`, `attachmentLimit`, `fileAccept`, `attachmentBytes`, `wireAttachments`, `readFiles`.
- [chat-composer.tsx](../../packages/web/src/components/sessions/chat-composer.tsx): `ChatComposer`.
- [chat-model-control.tsx](../../packages/web/src/components/sessions/chat-model-control.tsx): `ChatModelControl`.
- [chat-transcript.ts](../../packages/web/src/components/sessions/chat-transcript.ts): `HistoryGap`, `TranscriptSection`, `ChatTranscript`.
- [chat.tsx](../../packages/web/src/components/sessions/chat.tsx): `Chat`.
- [conversation-archives.tsx](../../packages/web/src/components/sessions/conversation-archives.tsx): `ConversationArchives`.
- [conversation-feed.ts](../../packages/web/src/components/sessions/conversation-feed.ts): `ConversationFeedState`, `ConversationFeed`.
- [conversation-inspector.tsx](../../packages/web/src/components/sessions/conversation-inspector.tsx): `ConversationInspectorLoading`, `ConversationInspector`, `ConversationInspectorProps`.
- [conversation-page.tsx](../../packages/web/src/components/sessions/conversation-page.tsx): `ConversationPage`.
- [conversation-preferences.tsx](../../packages/web/src/components/sessions/conversation-preferences.tsx): `ConversationPreferences`, `useConversationPins`.
- [conversation-row.tsx](../../packages/web/src/components/sessions/conversation-row.tsx): `ConversationRow`.
- [conversation-state.ts](../../packages/web/src/components/sessions/conversation-state.ts): `ChatMessage`, `QueuedInput`, `HistoryWindow`, `Execution`, `TranscriptChunk`, `ChatSnapshot`.
- [conversation-turn.tsx](../../packages/web/src/components/sessions/conversation-turn.tsx): `ConversationTurn`.
- [conversation-turns.ts](../../packages/web/src/components/sessions/conversation-turns.ts): `ConversationTurn`, `conversationTurns`.
- [draft-conversation-page.tsx](../../packages/web/src/components/sessions/draft-conversation-page.tsx): `DraftConversationPage`.
- [draft-project-picker.tsx](../../packages/web/src/components/sessions/draft-project-picker.tsx): `DraftProjectPicker`.
- [draft-storage.ts](../../packages/web/src/components/sessions/draft-storage.ts): `draftStorageKey`, `moveDraft`.
- [execution-labels.ts](../../packages/web/src/components/sessions/execution-labels.ts): `executionNeedsAttention`, `failureLabel`, `executionLabel`.
- [execution-status.tsx](../../packages/web/src/components/sessions/execution-status.tsx): `ExecutionStatus`.
- [fork-conversation-dialog.tsx](../../packages/web/src/components/sessions/fork-conversation-dialog.tsx): `ForkConversationDialog`.
- [inspector-agents.tsx](../../packages/web/src/components/sessions/inspector-agents.tsx): `InspectorAgents`.
- [inspector-code.tsx](../../packages/web/src/components/sessions/inspector-code.tsx): `InspectorCode`.
- [inspector-context.tsx](../../packages/web/src/components/sessions/inspector-context.tsx): `ContextSettings`, `InspectorContext`.
- [inspector-instructions.tsx](../../packages/web/src/components/sessions/inspector-instructions.tsx): `Guidance`, `InstructionEditor`, `RuntimeGuidance`.
- [inspector-navigation.tsx](../../packages/web/src/components/sessions/inspector-navigation.tsx): `InspectorNavigation`, `InspectorPanel`.
- [inspector-runtime-policy.tsx](../../packages/web/src/components/sessions/inspector-runtime-policy.tsx): `RuntimePolicyFields`, `InspectorRuntimePolicy`.
- [inspector-section.tsx](../../packages/web/src/components/sessions/inspector-section.tsx): `InspectorSection`, `InspectorSectionHeader`, `InspectorSectionTitle`, `InspectorSectionDescription`, `InspectorSectionContent`, `InspectorSectionActions`, `InspectorSectionAction`.
- [inspector-task-history.tsx](../../packages/web/src/components/sessions/inspector-task-history.tsx): `InspectorTaskHistory`.
- [inspector-tasks.tsx](../../packages/web/src/components/sessions/inspector-tasks.tsx): `taskLabels`, `InspectorTasks`, `ScheduleReview`, `PostRunSettings`.
- [inspector-tools.tsx](../../packages/web/src/components/sessions/inspector-tools.tsx): `InspectorTool`, `InspectorTools`.
- [inspector-workspace.tsx](../../packages/web/src/components/sessions/inspector-workspace.tsx): `RemoteWorkspace`, `InspectorWorkspace`.
- [message-markdown.tsx](../../packages/web/src/components/sessions/message-markdown.tsx): `MessageMarkdown`.
- [project-sessions.tsx](../../packages/web/src/components/sessions/project-sessions.tsx): `ProjectSessions`.
- [queued-messages.tsx](../../packages/web/src/components/sessions/queued-messages.tsx): `QueuedMessages`.
- [review-transcript.tsx](../../packages/web/src/components/sessions/review-transcript.tsx): `ReviewTranscript`.
- [runtime-policy-form.ts](../../packages/web/src/components/sessions/runtime-policy-form.ts): `PolicyValue`, `RuntimePolicy`, `PolicyField`, `policyGroups`, `modelFields`, `fieldValue`, `fieldError`, `applyFields`, `modelPolicies`, `setModelPolicy`.
- [schedule-job.tsx](../../packages/web/src/components/sessions/schedule-job.tsx): `ScheduleJob`.
- [scroll-anchor.ts](../../packages/web/src/components/sessions/scroll-anchor.ts): `ScrollAnchor`, `captureScrollAnchor`, `restoreScrollAnchor`.
- [standalone-conversation-page.tsx](../../packages/web/src/components/sessions/standalone-conversation-page.tsx): `StandaloneConversationPage`.
- [tool-activity.tsx](../../packages/web/src/components/sessions/tool-activity.tsx): `ToolActivity`.
- [use-chat-models.ts](../../packages/web/src/components/sessions/use-chat-models.ts): `ChatModel`, `ModelRef`, `RuntimeDefaults`, `RuntimeDefaultsSnapshot`, `modelKey`, `resolveChatModelSelection`, `useChatModels`.
- [use-conversation.ts](../../packages/web/src/components/sessions/use-conversation.ts): `useConversation`.
- [use-inspector-selection.ts](../../packages/web/src/components/sessions/use-inspector-selection.ts): `useInspectorSelection`.
- [use-pending-conversation-inspector.tsx](../../packages/web/src/components/sessions/use-pending-conversation-inspector.tsx): `usePendingConversationInspector`.
- [use-project-navigation.ts](../../packages/web/src/components/sessions/use-project-navigation.ts): `useProjectNavigation`.
- [use-project-sessions.ts](../../packages/web/src/components/sessions/use-project-sessions.ts): `SessionRecord`, `Conversation`, `Session`, `sessionsChanged`, `useProjectSessions`.
- [use-reviewer-profiles.ts](../../packages/web/src/components/sessions/use-reviewer-profiles.ts): `ReviewerProfile`, `ReviewerProfiles`, `reviewerProfilesPath`, `useReviewerProfiles`.
- [workspace-inspector.tsx](../../packages/web/src/components/sessions/workspace-inspector.tsx): `WorkspaceInspector`.

### Sessions invariants

- `ChatTranscript` validates history IDs, predecessor bounds and message membership; gaps follow ancestry rather than numeric adjacency (`chat-transcript.ts`).
- `ConversationFeed` retains loaded transcript within its client/path lifetime; `useConversation` hides snapshots from stale clients or keys (`conversation-feed.ts`, `use-conversation.ts`).
- `readFiles` allows at most four files and 2 MiB total, caps text at 128 KiB and rejects empty or invalid text; `wireAttachments` omits UI IDs (`attachments.ts`).
- `Chat` persists captured send data and its request ID before admission; uncertain delivery retains pending data (`chat.tsx`).
- `DraftChat` persists creation/message identities; `moveDraft` rejects pending or occupied destinations and saves the destination before removing the source (`draft-conversation-page.tsx`, `draft-storage.ts`).
- `QueuedMessages` submits expected content and busy mode to reject stale edits (`queued-messages.tsx`).
- `ConversationInspector` serializes revision-bearing configuration writes and fences older polling results; editors preserve and block stale drafts (`conversation-inspector.tsx`, `inspector-instructions.tsx:InstructionEditor`).
- `ScheduleJob`, `ScheduleReview` and agent controls reuse admission IDs for unchanged input; job/check recovery requires acknowledgement of earlier effects (`schedule-job.tsx`, `inspector-tasks.tsx`, `inspector-agents.tsx:AgentControls`, `inspector-task-history.tsx:HistoryPage`).

### Sessions side effects

- `ConversationFeed` subscribes to events and requests history; closing aborts history requests and unsubscribes (`conversation-feed.ts`).
- `Chat` and `DraftChat` persist browser session drafts; `ConversationPreferences` saves pins and `useInspectorSelection` saves scoped inspector selection (`chat.tsx`, `draft-conversation-page.tsx`, `conversation-preferences.tsx`, `use-inspector-selection.ts`).
- `sessionsChanged` dispatches `console:sessions-changed`; list and inspector hooks poll backend state and clean up timers/controllers (`use-project-sessions.ts`, `inspector-tasks.tsx:InspectorTasks`, `inspector-agents.tsx:InspectorAgents`).
- Chat, inspector and scheduling controls submit backend messages, configuration and work requests; they do not implement worker isolation locally (`chat.tsx:Chat`, `conversation-inspector.tsx:ConversationInspector`, `schedule-job.tsx:ScheduleJob`).
- `MessageAttachments` fetches downloadable bytes and revokes Blob URLs after ten seconds; `MessageMarkdown` skips HTML and renders image references as links (`attachment-list.tsx`, `message-markdown.tsx`).

### Sessions verification

Run from the repository root:

```sh
pnpm --filter @console/web test
```

## Settings

Source root: `packages/web/src/components/settings`.

### Settings overview

Client and machine preferences, scoped backend configuration editors, profiles, integrations and theme presentation.

### Settings interface

- [add-connection.tsx](../../packages/web/src/components/settings/add-connection.tsx): `AddConnection`.
- [appearance-settings.tsx](../../packages/web/src/components/settings/appearance-settings.tsx): `AppearanceSettings`.
- [configuration-settings.tsx](../../packages/web/src/components/settings/configuration-settings.tsx): `ConfigurationSettings`.
- [connections-settings.tsx](../../packages/web/src/components/settings/connections-settings.tsx): `ConnectionsSettings`.
- [conversation-settings.tsx](../../packages/web/src/components/settings/conversation-settings.tsx): `ConversationSettings`.
- [extension-settings.tsx](../../packages/web/src/components/settings/extension-settings.tsx): `ExtensionSettings`.
- [integration-settings.tsx](../../packages/web/src/components/settings/integration-settings.tsx): `IntegrationSettings`.
- [machine-preference-landing.tsx](../../packages/web/src/components/settings/machine-preference-landing.tsx): `MachinePreferenceLanding`.
- [machine-preference-tabs.tsx](../../packages/web/src/components/settings/machine-preference-tabs.tsx): `MachinePreferenceTabs`.
- [preferences-navigation.tsx](../../packages/web/src/components/settings/preferences-navigation.tsx): `PreferencesNavigation`.
- [project-default-tools.tsx](../../packages/web/src/components/settings/project-default-tools.tsx): `ProjectDefaultTools`.
- [reviewer-profile-settings.tsx](../../packages/web/src/components/settings/reviewer-profile-settings.tsx): `ReviewerProfileSettings`.
- [runtime-settings.tsx](../../packages/web/src/components/settings/runtime-settings.tsx): `RuntimeSettings`.
- [scoped-settings.tsx](../../packages/web/src/components/settings/scoped-settings.tsx): `ScopedSettingsTarget`, `ScopedSettings`.
- [settings-presentation.tsx](../../packages/web/src/components/settings/settings-presentation.tsx): `SettingsHeading`, `SettingsDisclosure`.
- [settings-scope-nav.tsx](../../packages/web/src/components/settings/settings-scope-nav.tsx): `SettingsScopeNav`.
- [shortcut-row.tsx](../../packages/web/src/components/settings/shortcut-row.tsx): `ShortcutTableRow`.
- [shortcut-settings.tsx](../../packages/web/src/components/settings/shortcut-settings.tsx): `ShortcutSettings`.
- [theme-colors-dialog.tsx](../../packages/web/src/components/settings/theme-colors-dialog.tsx): `ThemeColorsDialog`.
- [theme-family-card.tsx](../../packages/web/src/components/settings/theme-family-card.tsx): `ThemeFamilyCard`.
- [theme-preview.tsx](../../packages/web/src/components/settings/theme-preview.tsx): `ThemePreview`.

### Settings invariants

- `SettingsForm` retains the original revision, blocks stale drafts and ignores polling results superseded by saves (`scoped-settings.tsx`).
- `ConversationSettings` requires ownership matching the current client and session before rendering the inspector (`conversation-settings.tsx:owner`).
- `ProfilesForm` validates normalized names, available models, supported thinking, turn/pass limits and agent tools; stale revisions block saving (`reviewer-profile-settings.tsx`).
- `DefaultsForm` retains newer revisions and blocks stale runtime-default edits or unavailable models (`runtime-settings.tsx`).
- `ConfigurationEditor` saves parsed integration drafts with a revision and closed entry editor; MCP tools omitted means all, while an empty array means none (`integration-settings.tsx:IntegrationForm`).

### Settings side effects

- `ConfigurationSettings` previews parsed backups before importing, exposes undo and downloads JSON exports; input files are capped at 2,000,000 bytes (`configuration-settings.tsx`).
- `AppearanceSettings` imports one theme file up to 65,536 bytes; `ThemeFamilyCard` applies selections through appearance state and downloads serialized theme definitions (`appearance-settings.tsx`, `theme-family-card.tsx`).
- `DefaultsForm` polls every ten seconds; scoped/profile/runtime editors submit backend configuration (`runtime-settings.tsx`, `scoped-settings.tsx:SettingsForm`, `reviewer-profile-settings.tsx:ProfilesForm`).
- `ExtensionEditor` saves revision-bearing manifests and reloads definitions; integration saves can reload shared connections (`extension-settings.tsx`, `integration-settings.tsx:ConfigurationEditor`).

### Settings verification

Run from the repository root:

```sh
pnpm --filter @console/web test
```

## Ui

Source root: `packages/web/src/components/ui`.

### Ui overview

Shared presentational controls and composite primitives built from Base UI, cmdk, resizable panels and local React components.

### Ui interface

- [badge.tsx](../../packages/web/src/components/ui/badge.tsx): `Badge`, `badgeVariants`.
- [bubble.tsx](../../packages/web/src/components/ui/bubble.tsx): `Bubble`, `BubbleContent`, `BubbleGroup`, `BubbleReactions`.
- [button.tsx](../../packages/web/src/components/ui/button.tsx): `Button`, `buttonVariants`.
- [card.tsx](../../packages/web/src/components/ui/card.tsx): `Card`, `CardAction`, `CardContent`, `CardDescription`, `CardFooter`, `CardHeader`, `CardTitle`.
- [checkbox.tsx](../../packages/web/src/components/ui/checkbox.tsx): `Checkbox`.
- [code-block.tsx](../../packages/web/src/components/ui/code-block.tsx): `CodeBlock`, `CodeBlockActions`, `CodeBlockContent`, `CodeBlockCopyButton`, `CodeBlockFooter`, `CodeBlockHeader`, `CodeBlockLine`, `CodeBlockTitle`.
- [collapsible.tsx](../../packages/web/src/components/ui/collapsible.tsx): `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger`.
- [command.tsx](../../packages/web/src/components/ui/command.tsx): `Command`, `CommandDialog`, `CommandEmpty`, `CommandGroup`, `CommandInput`, `CommandItem`, `CommandList`, `CommandSeparator`, `CommandShortcut`.
- [context-menu.tsx](../../packages/web/src/components/ui/context-menu.tsx): `ContextMenu`, `ContextMenuCheckboxItem`, `ContextMenuContent`, `ContextMenuGroup`, `ContextMenuItem`, `ContextMenuLabel`, `ContextMenuPortal`, `ContextMenuRadioGroup`, `ContextMenuRadioItem`, `ContextMenuSeparator`, `ContextMenuShortcut`, `ContextMenuSub`, `ContextMenuSubContent`, `ContextMenuSubTrigger`, `ContextMenuTrigger`.
- [dialog.tsx](../../packages/web/src/components/ui/dialog.tsx): `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger`.
- [dropdown-menu.tsx](../../packages/web/src/components/ui/dropdown-menu.tsx): `DropdownMenu`, `DropdownMenuCheckboxItem`, `DropdownMenuContent`, `DropdownMenuGroup`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuPortal`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`, `DropdownMenuTrigger`.
- [empty.tsx](../../packages/web/src/components/ui/empty.tsx): `Empty`, `EmptyContent`, `EmptyDescription`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`.
- [field.tsx](../../packages/web/src/components/ui/field.tsx): `Field`, `FieldContent`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldLabel`, `FieldLegend`, `FieldSeparator`, `FieldSet`, `FieldTitle`.
- [input-group.tsx](../../packages/web/src/components/ui/input-group.tsx): `InputGroup`, `InputGroupAddon`, `InputGroupButton`, `InputGroupInput`, `InputGroupText`, `InputGroupTextarea`.
- [input.tsx](../../packages/web/src/components/ui/input.tsx): `Input`.
- [label.tsx](../../packages/web/src/components/ui/label.tsx): `Label`.
- [popover.tsx](../../packages/web/src/components/ui/popover.tsx): `Popover`, `PopoverContent`, `PopoverDescription`, `PopoverHeader`, `PopoverTitle`, `PopoverTrigger`.
- [resizable.tsx](../../packages/web/src/components/ui/resizable.tsx): `ResizableHandle`, `ResizablePanel`, `ResizablePanelGroup`.
- [scroll-area.tsx](../../packages/web/src/components/ui/scroll-area.tsx): `ScrollArea`, `ScrollBar`.
- [select.tsx](../../packages/web/src/components/ui/select.tsx): `Select`, `SelectContent`, `SelectGroup`, `SelectItem`, `SelectLabel`, `SelectScrollDownButton`, `SelectScrollUpButton`, `SelectSeparator`, `SelectTrigger`, `SelectValue`.
- [separator.tsx](../../packages/web/src/components/ui/separator.tsx): `Separator`.
- [sheet.tsx](../../packages/web/src/components/ui/sheet.tsx): `Sheet`, `SheetClose`, `SheetContent`, `SheetDescription`, `SheetFooter`, `SheetHeader`, `SheetTitle`, `SheetTrigger`.
- [sidebar.tsx](../../packages/web/src/components/ui/sidebar.tsx): `Sidebar`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupAction`, `SidebarGroupContent`, `SidebarGroupLabel`, `SidebarHeader`, `SidebarInput`, `SidebarInset`, `SidebarMenu`, `SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuButton`, `SidebarMenuItem`, `SidebarMenuSkeleton`, `SidebarMenuSub`, `SidebarMenuSubButton`, `SidebarMenuSubItem`, `SidebarProvider`, `SidebarRail`, `SidebarSeparator`, `SidebarTrigger`, `useSidebar`.
- [skeleton.tsx](../../packages/web/src/components/ui/skeleton.tsx): `Skeleton`.
- [slider.tsx](../../packages/web/src/components/ui/slider.tsx): `Slider`.
- [switch.tsx](../../packages/web/src/components/ui/switch.tsx): `Switch`.
- [table.tsx](../../packages/web/src/components/ui/table.tsx): `Table`, `TableBody`, `TableCaption`, `TableCell`, `TableFooter`, `TableHead`, `TableHeader`, `TableRow`.
- [tabs.tsx](../../packages/web/src/components/ui/tabs.tsx): `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`, `tabsListVariants`.
- [textarea.tsx](../../packages/web/src/components/ui/textarea.tsx): `Textarea`.
- [toast.tsx](../../packages/web/src/components/ui/toast.tsx): `createToastManager`, `Toast`, `ToastAction`, `ToastClose`, `ToastContent`, `ToastDescription`, `Toaster`, `ToastPortal`, `ToastProvider`, `ToastTitle`, `ToastViewport`, `toast`, `useToastManager`.
- [toggle-group.tsx](../../packages/web/src/components/ui/toggle-group.tsx): `ToggleGroup`, `ToggleGroupItem`.
- [toggle.tsx](../../packages/web/src/components/ui/toggle.tsx): `Toggle`, `toggleVariants`.
- [tooltip.tsx](../../packages/web/src/components/ui/tooltip.tsx): `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`.

### Ui invariants

- `useSidebar` requires `SidebarProvider`; desktop controlled state and mobile open state are separate (`sidebar.tsx`).
- `FieldError` prefers children, deduplicates error messages and renders nothing without content (`field.tsx`).
- `Slider` derives thumb count from supplied value arrays; otherwise it renders the min/max pair (`slider.tsx`).
- `ScrollArea` exposes its viewport ref and scroll callback and accepts scrollbar orientation (`scroll-area.tsx`).

### Ui side effects

- `CodeBlockCopyButton` writes to the clipboard and resets copied state after two seconds (`code-block.tsx`).
- `toast` creates a shared manager; `Toaster` defaults to a 4.5-second timeout and three visible notifications (`toast.tsx`).
- Overlay content components mount portals and positioners; `DialogContent` and `SheetContent` include backdrops (`dialog.tsx`, `sheet.tsx`).

### Ui verification

Run from the repository root:

```sh
pnpm --filter @console/web test
```

## Workspace

Source root: `packages/web/src/components/workspace`.

### Workspace overview

Machine workspace navigation and pinned, project and standalone conversation lists.

### Workspace interface

- [device-workspace.tsx](../../packages/web/src/components/workspace/device-workspace.tsx): `DeviceWorkspace`.
- [project-tree.tsx](../../packages/web/src/components/workspace/project-tree.tsx): `ProjectTree`.
- [use-pinned-conversations.ts](../../packages/web/src/components/workspace/use-pinned-conversations.ts): `usePinnedConversations`.
- [use-standalone-navigation.ts](../../packages/web/src/components/workspace/use-standalone-navigation.ts): `useStandaloneNavigation`.

### Workspace invariants

- `usePinnedConversations` exposes results only for the connected matching client and distinguishes loading from unavailable pins (`use-pinned-conversations.ts`).
- `useStandaloneNavigation` scopes snapshots to origin/client and retains prior data on errors only within that scope (`use-standalone-navigation.ts`).
- `ProjectTree` separates pinned rows from regular lists; unresolved pinned conversations retain Unpin (`project-tree.tsx:ProjectTreeContent`).

### Workspace side effects

- `usePinnedConversations` resolves deduplicated session IDs; it and `useStandaloneNavigation` poll every ten seconds and respond to session-change events (`use-pinned-conversations.ts`, `use-standalone-navigation.ts`).
- `ProjectTree` changes pins, persists Recents disclosure, opens archive dialogs and leaves the active project route after archival (`project-tree.tsx:ProjectTreeContent`).

### Workspace verification

Run from the repository root:

```sh
pnpm --filter @console/web test
```

## Hooks

Source root: `packages/web/src/hooks`.

### Hooks overview

React hooks for connection-bound requests, incremental highlighting and responsive layouts.

### Hooks interface

- [use-backend-request.ts](../../packages/web/src/hooks/use-backend-request.ts): `useBackendRequest`.
- [use-highlighted-code.ts](../../packages/web/src/hooks/use-highlighted-code.ts): `useHighlightedCode`.
- [use-mobile.ts](../../packages/web/src/hooks/use-mobile.ts): `useIsMobile`.
- `use-backend-request.ts` re-exports `BackendRequestError` from the backend client.

### Hooks invariants

- `use-backend-request.ts:useBackendRequest` rejects requests when its captured client is disconnected or superseded.
- `use-highlighted-code.ts:useHighlightedCode` caches completed lines and resets grammar state when text ceases to extend the prior prefix or the highlighter changes.
- `use-mobile.ts:useIsMobile` uses a 768px breakpoint and returns false before the client effect resolves.

### Hooks side effects

- `useBackendRequest` delegates HTTP requests to the captured client.
- `useHighlightedCode` asynchronously loads language support; `useIsMobile` registers and cleans up a media-query listener.

### Hooks verification

- Run `pnpm --filter @console/web test` from the repository root.

## Application services

Source root: `packages/web/src/lib`.

### Application services overview

Command identities, capability metadata, navigation, preference parsers and browser-side request helpers.

### Application services interface

- [capabilities.ts](../../packages/web/src/lib/capabilities.ts): `CapabilityScope`, `CapabilityKind`, `Capability`, `capabilities`, `searchCapabilities`.
- [command-registry.ts](../../packages/web/src/lib/command-registry.ts): `CommandHandler`, `RegisteredCommands`, `CommandRegistry`, `slashCommands`, `slashSuggestions`.
- [commands.ts](../../packages/web/src/lib/commands.ts): `Shortcut`, `commands`, `CommandId`, `commandIds`, `ShortcutOverrides`, `shortcutStorageKey`, `defaultShortcut`, `shortcutsFor`, `shortcutFor`, `shortcutConflict`, `parseShortcuts`, `isShortcut`, `shortcutFromEvent`, `formatShortcut`, `ariaShortcut`, `commandWorksInEditor`.
- [connection.ts](../../packages/web/src/lib/connection.ts): `BackendConnection`, `backendOrigin`, `checkConnection`.
- [conversation-path.ts](../../packages/web/src/lib/conversation-path.ts): `standaloneConversationPath`.
- [conversation-pins.ts](../../packages/web/src/lib/conversation-pins.ts): `conversationPinsKey`, `conversationKey`, `parseConversationPins`, `orderConversations`.
- [delete-archived-conversations.ts](../../packages/web/src/lib/delete-archived-conversations.ts): `ArchiveTarget`, `deleteArchivedConversations`.
- [devices.ts](../../packages/web/src/lib/devices.ts): `deviceIcons`, `deviceColors`, `DeviceAppearance`, `Device`, `devicesStorageKey`, `connectedDevicesKey`, `legacyConnectedDeviceKey`, `parseConnectedDevices`, `parseDevices`, `newDevice`.
- [highlighter.tsx](../../packages/web/src/lib/highlighter.tsx): `loadHighlighter`, `highlightCode`.
- [inspector-availability.ts](../../packages/web/src/lib/inspector-availability.ts): `inspectorSectionAvailable`.
- [inspector-preferences.ts](../../packages/web/src/lib/inspector-preferences.ts): `inspectorScopes`, `inspectorSections`, `InspectorScope`, `InspectorSection`, `InspectorSelection`, `defaultInspectorSelection`, `inspectorPreferenceKey`, `parseInspectorSelection`, `availableInspectorSelection`, `inspectorSectionInfo`.
- [integration-settings.ts](../../packages/web/src/lib/integration-settings.ts): `IntegrationKind`, `IntegrationEntry`, `IntegrationConfiguration`, `integrationRoot`, `parseIntegrationDraft`, `upsertIntegration`.
- [navigation-actions.ts](../../packages/web/src/lib/navigation-actions.ts): `navigationActions`, `NavigationEntityKind`, `NavigationActionId`, `supportsNavigationAction`.
- [navigation-drop.ts](../../packages/web/src/lib/navigation-drop.ts): `NavigationDragItem`, `NavigationDropTarget`, `NavigationDropIntent`, `navigationDropIntent`.
- [navigation-memory.ts](../../packages/web/src/lib/navigation-memory.ts): `NavigationMemory`, `navigationMemoryKey`, `emptyNavigationMemory`, `workspaceDevice`, `parseNavigationMemory`, `rememberWorkspaceRoute`.
- [navigation-sections.ts](../../packages/web/src/lib/navigation-sections.ts): `splitPinnedItems`.
- [palette-catalog.ts](../../packages/web/src/lib/palette-catalog.ts): `PaletteCatalog`, `loadPaletteCatalog`.
- [palette-navigation.ts](../../packages/web/src/lib/palette-navigation.ts): `PaletteTarget`, `PaletteKind`, `PaletteDestination`, `targetKey`, `withinScope`, `paletteAncestors`, `conversationHref`, `paletteCommandTarget`, `paletteCommandGroup`, `targetLabel`, `searchDestinations`, `paletteTargetFromPath`, `rememberedDestinations`, `paletteSelectionIsCurrent`.
- [palette-search.ts](../../packages/web/src/lib/palette-search.ts): `commandAliases`, `paletteSearchScore`, `rankPaletteResults`, `paletteSelection`.
- [plan-command.ts](../../packages/web/src/lib/plan-command.ts): `togglePlanMode`.
- [preferences-navigation.ts](../../packages/web/src/lib/preferences-navigation.ts): `PreferenceTarget`, `clientPreferencePages`, `machinePreferencePages`, `MachinePreferenceCategory`, `machinePreferenceCategory`, `machinePreferenceHref`, `preferenceMachine`, `preferencesHref`, `preferenceTarget`, `isPreferencesPath`, `conversationSettingsHref`, `SettingsDestination`, `settingsDestinationHref`, `scopedSettingsDestinations`.
- [project-pins.ts](../../packages/web/src/lib/project-pins.ts): `ProjectPins`, `projectPinsStorageKey`, `parseProjectPins`, `updateProjectPins`, `orderPinnedProjects`.
- [providers.ts](../../packages/web/src/lib/providers.ts): `ProviderSummary`, `ProviderOverview`, `ProviderModel`, `LoginView`, `providerPath`.
- [runtime-policy-draft.ts](../../packages/web/src/lib/runtime-policy-draft.ts): `RuntimePolicyDraft`, `resetRuntimePolicyDraft`, `runtimePolicyDraftInvalid`, `runtimePolicyDraftValue`.
- [shortcut-editor.ts](../../packages/web/src/lib/shortcut-editor.ts): `ShortcutEdit`, `editShortcut`, `ShortcutRow`, `shortcutRows`, `filterShortcutRows`.
- [utils.ts](../../packages/web/src/lib/utils.ts) re-exports `cn` from the external cn package.

### Application services invariants

- `command-registry.ts:CommandRegistry` resolves handlers only for the supplied route, checks disabled reasons and disposes registrations by token; `slashSuggestions` suppresses suggestions during composition.
- `commands.ts:parseShortcuts` rejects conflicting effective bindings; `shortcutFromEvent` ignores composition and AltGraph. `shortcut-editor.ts:editShortcut` validates against the latest overrides.
- `connection.ts:backendOrigin` accepts HTTPS or loopback HTTP origins only, without userinfo, path, query or fragment; `checkConnection` requires Console API version 1 and an installation identity.
- `navigation-memory.ts:rememberWorkspaceRoute` remembers only supported workspace paths and keeps at most 30 recent routes; `navigation-drop.ts:navigationDropIntent` offers pinning rather than transferring ownership.
- `palette-navigation.ts:paletteCommandTarget` retains the current view target; `paletteSelectionIsCurrent` compares route, URL and client before deferred selection.
- `plan-command.ts:togglePlanMode` reads confirmed configuration and sends a captured-target, revision-protected update.
- `integration-settings.ts:upsertIntegration` rejects new entries beyond eight MCP definitions or sixteen SSH profiles; MCP executable paths must be absolute.
- `delete-archived-conversations.ts:deleteArchivedConversations` retries failed removals only while a pass makes progress, returning remaining failures.

### Application services side effects

- `connection.ts:checkConnection` performs fetch; `palette-catalog.ts:loadPaletteCatalog` reads metadata with at most four concurrent reads per batch and retains partial errors.
- `plan-command.ts:togglePlanMode` writes conversation configuration; `deleteArchivedConversations` calls the supplied removal callback.
- `highlighter.tsx:loadHighlighter` loads Shiki grammars/themes lazily. `CommandRegistry` mutates its registry and notifies subscribers; preference parser helpers return data without persisting it.

### Application services verification

- Run `pnpm --filter @console/web test` from the repository root.

## Backend transport

Source root: `packages/web/src/lib/backend`.

### Backend transport overview

Connection lifetime, authenticated HTTP/SSE and explicit adapters for known backend commands.

### Backend transport interface

- [auth.ts](../../packages/web/src/lib/backend/auth.ts): `backendToken`, `setBackendToken`, `clearBackendToken`, `pairBackend`.
- [client.ts](../../packages/web/src/lib/backend/client.ts): `BackendClient`, `BackendConnector`, `BackendRequestError`.
- [commands.ts](../../packages/web/src/lib/backend/commands.ts): `CommandTarget`, `backendOperations`, `BackendCommandId`, `executeBackendCommand`.
- [connection-manager.ts](../../packages/web/src/lib/backend/connection-manager.ts): `ConnectionState`, `disconnected`, `ConnectionManager`.
- [event-stream.ts](../../packages/web/src/lib/backend/event-stream.ts): `authenticatedEvents`.
- [local-http.ts](../../packages/web/src/lib/backend/local-http.ts): `localHttpConnector`.

### Backend transport invariants

- `local-http.ts:createLocalClient` rejects paths outside its origin and backslash paths, and aborts requests/subscriptions when closed; its request fetches omit cookies and refuse redirects.
- `connection-manager.ts:ConnectionManager.connect` rejects missing or mismatched backend identity and duplicate live aliases; stale attempts cannot publish state.
- `commands.ts:executeBackendCommand` encodes required target IDs into a fixed operation map; missing IDs fail before the request.
- `auth.ts:backendToken` scopes tokens to backend origin; `event-stream.ts:authenticatedEvents` sends bearer tokens in headers.

### Backend transport side effects

- `auth.ts:pairBackend` posts a pairing code and stores the returned token in memory and sessionStorage.
- `localHttpConnector` probes and issues fetch requests, creates EventSource or authenticated fetch streams, and owns abort controllers.
- `ConnectionManager` emits state updates and schedules probes; `authenticatedEvents` retries disconnected streams after one second.

### Backend transport verification

- Run `pnpm --filter @console/web test` from the repository root.

## Browser configuration

Source root: `packages/web/src/lib/configuration`.

### Browser configuration overview

Validated browser preference storage, backup migration and semantic theme definitions.

### Browser configuration interface

- [appearance-command.ts](../../packages/web/src/lib/configuration/appearance-command.ts): `appearanceCommandIds`, `AppearanceCommandId`, `AppearancePicker`, `appearancePicker`, `applyAppearanceCommand`.
- [store.ts](../../packages/web/src/lib/configuration/store.ts): `configurationKey`, `configurationEvent`, `preferenceKeys`, `ConfigurationBackup`, `parseBackup`, `ConfigurationStore`, `clientConfiguration`, `subscribeConfiguration`.
- `store.ts` also re-exports `ImportedTheme`, `parseTheme` and `themeTokens` from theme-schema.ts.
- [theme-export.ts](../../packages/web/src/lib/configuration/theme-export.ts): `downloadTheme`.
- [theme-gallery.ts](../../packages/web/src/lib/configuration/theme-gallery.ts): `themeTokenGroups`, `ThemeFamily`, `groupThemeFamilies`, `themeColorGroups`.
- [theme-preview.ts](../../packages/web/src/lib/configuration/theme-preview.ts): `ThemePreviewStore`, `themePreview`.
- [theme-schema.ts](../../packages/web/src/lib/configuration/theme-schema.ts): `themeTokens`, `ImportedTheme`, `object`, `exact`, `parseTheme`.
- [themes.ts](../../packages/web/src/lib/configuration/themes.ts): `builtinThemes`, `defaultAppearance`, `Appearance`, `appearanceKey`, `themeCatalog`, `completeTheme`, `activeTheme`, `parseAppearance`, `migrateAppearance`, `readAppearance`, `themeDocument`.

### Browser configuration invariants

- `store.ts:ConfigurationStore` commits a single version-1 storage envelope; `parseBackup` accepts backup versions 1 and 2 and returns version 2.
- `store.ts:parseBackup` rejects invalid/conflicting shortcuts and duplicate themes, strips imported backend identities and excludes access credentials and transcripts.
- `ConfigurationStore.import` and `undo` clear remembered connections; undo exists only on that store instance after a successful import.
- `theme-schema.ts:parseTheme` requires a custom-prefixed ID, supported token names and six-digit hex colors; `themes.ts:parseAppearance` verifies light/dark selections.
- `theme-preview.ts:ThemePreviewStore` keeps previews in memory and only applies previews matching the active mode; `clear` checks the owner token.

### Browser configuration side effects

- `store.ts:ConfigurationStore.commit` writes storage and invokes its notification callback; `clientConfiguration` supplies localStorage and configuration-event dispatch, while `subscribeConfiguration` installs local and cross-tab listeners.
- `theme-export.ts:downloadTheme` creates a Blob URL, clicks a download link and revokes the URL later.
- `ThemePreviewStore` notifies subscribers without writing preferences.

### Browser configuration verification

- Run `pnpm --filter @console/web test` from the repository root.

## Route entry points

Each page delegates feature behavior to its component contract above; the table records local composition, fixed scope and compatibility redirects.

| Source | Entry/composition | Local rules and effects |
| --- | --- | --- |
| [src/app/devices/page.tsx](../../packages/web/src/app/devices/page.tsx) | `Devices` renders `ConnectionsSettings`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/page.tsx) | `Device` renders `DeviceWorkspace`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/conversations/[sessionId]/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/conversations/%5BsessionId%5D/page.tsx) | `Page` renders `StandaloneConversationPage`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/conversations/[sessionId]/[conversationId]/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/conversations/%5BsessionId%5D/%5BconversationId%5D/page.tsx) | `Page` renders `StandaloneConversationPage`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/conversations/new/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/conversations/new/page.tsx) | `Page` renders `DraftConversationPage`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/projects/[projectId]/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/projects/%5BprojectId%5D/page.tsx) | `OpenProject` renders `ProjectPage`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/projects/[projectId]/conversations/new/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/projects/%5BprojectId%5D/conversations/new/page.tsx) | `Page` renders `DraftConversationPage`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/projects/[projectId]/sessions/[sessionId]/conversations/[conversationId]/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/projects/%5BprojectId%5D/sessions/%5BsessionId%5D/conversations/%5BconversationId%5D/page.tsx) | `Page` renders `ConversationPage`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/projects/[projectId]/settings/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/projects/%5BprojectId%5D/settings/page.tsx) | `Settings` renders `ProjectPage`, `ScopedSettings`. | `page.tsx:Settings` fixes `scope="project"` for its editor. |
| [src/app/devices/[deviceId]/projects/new/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/projects/new/page.tsx) | `AddProject` renders `ProjectSetup`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/sessions/[sessionId]/conversations/[conversationId]/settings/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/sessions/%5BsessionId%5D/conversations/%5BconversationId%5D/settings/page.tsx) | `Page` renders `ConversationSettings`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/sessions/[sessionId]/settings/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/sessions/%5BsessionId%5D/settings/page.tsx) | `Page` renders `ScopedSettings`. | `page.tsx:Page` fixes `scope="session"` for its editor. |
| [src/app/devices/[deviceId]/settings/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/page.tsx) | `DeviceSettings` resolves the route destination. | `page.tsx:DeviceSettings` invokes Next redirect to `preferencesHref({ deviceId })`. |
| [src/app/devices/[deviceId]/settings/agents/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/agents/page.tsx) | `Page` renders `ReviewerProfileSettings`. | `page.tsx:Page` fixes `kind="agent"` for its editor. |
| [src/app/devices/[deviceId]/settings/archives/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/archives/page.tsx) | `Page` renders `ConversationArchives`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/settings/extensions/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/extensions/page.tsx) | `Page` renders `ExtensionSettings`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/settings/guidance/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/guidance/page.tsx) | `Page` renders `ScopedSettings`. | `page.tsx:Page` fixes `scope="machine"` for its editor. |
| [src/app/devices/[deviceId]/settings/integrations/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/integrations/page.tsx) | `Page` resolves the route destination. | `page.tsx:Page` invokes Next redirect to the same device’s MCP settings with an encoded device ID. |
| [src/app/devices/[deviceId]/settings/mcp/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/mcp/page.tsx) | `Page` renders `IntegrationSettings`. | `page.tsx:Page` fixes `kind="mcp"` for its editor. |
| [src/app/devices/[deviceId]/settings/projects/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/projects/page.tsx) | `Page` renders `ProjectSettings`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/settings/providers/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/providers/page.tsx) | `Page` renders `ProviderSettings`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/settings/reviewers/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/reviewers/page.tsx) | `Page` renders `ReviewerProfileSettings`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/settings/runtime/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/runtime/page.tsx) | `Page` renders `RuntimeSettings`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/devices/[deviceId]/settings/ssh/page.tsx](../../packages/web/src/app/devices/%5BdeviceId%5D/settings/ssh/page.tsx) | `Page` renders `IntegrationSettings`. | `page.tsx:Page` fixes `kind="ssh"` for its editor. |
| [src/app/devices/new/page.tsx](../../packages/web/src/app/devices/new/page.tsx) | `NewDevice` renders `AddConnection`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/settings/page.tsx](../../packages/web/src/app/settings/page.tsx) | `Settings` resolves the route destination. | `page.tsx:Settings` takes the first array-valued search parameter and derives scope using `preferenceTarget`. `page.tsx:Settings` invokes Next redirect to `preferencesHref(preferenceTarget(...))`, preserving the resolved query scope. |
| [src/app/settings/appearance/page.tsx](../../packages/web/src/app/settings/appearance/page.tsx) | `Appearance` renders `AppearanceSettings`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/settings/configuration/page.tsx](../../packages/web/src/app/settings/configuration/page.tsx) | `Page` renders `ConfigurationSettings`. | Delegates to the rendered component; no direct local I/O. |
| [src/app/settings/connections/page.tsx](../../packages/web/src/app/settings/connections/page.tsx) | `Connections` resolves the route destination. | `page.tsx:Connections` invokes Next redirect to `/devices`. |
| [src/app/settings/connections/new/page.tsx](../../packages/web/src/app/settings/connections/new/page.tsx) | `NewConnection` resolves the route destination. | `page.tsx:NewConnection` invokes Next redirect to `/devices/new`. |
| [src/app/settings/machines/[category]/page.tsx](../../packages/web/src/app/settings/machines/%5Bcategory%5D/page.tsx) | `Page` renders `MachinePreferenceLanding`. | `page.tsx:Page` accepts categories from `machinePreferencePages`; unknown categories invoke `notFound()`. `page.tsx:Page` invokes Next redirect to `/settings/machines/mcp` for the integrations alias. |
| [src/app/settings/shortcuts/page.tsx](../../packages/web/src/app/settings/shortcuts/page.tsx) | `Page` renders `ShortcutSettings`. | Delegates to the rendered component; no direct local I/O. |

## Styles and assets

- [globals.css](../../packages/web/src/app/globals.css) defines Tailwind semantic tokens, Inter typography, light/dark defaults, viewport-bound layout, sidebar/disclosure motion, reduced-motion behavior and conversation Markdown styling.
- [console.svg](../../packages/web/public/console.svg) is the shared application mark served as a static asset.
- [components.json](../../packages/web/components.json) selects the Base Lyra shadcn preset, Base UI component paths, aliases, CSS variables and Lucide icons.
- [tsconfig.json](../../packages/web/tsconfig.json) enables strict bundler-mode checking, the Next plugin, @/ aliases and generated Next route types.
