# Web

The Tasks inspector manages persistent background agents: create a named agent, send or steer requests, choose display/context/follow-up delivery, inspect its transcript, and stop active and queued work.

The Background review form and reviewer-profile editor expose 1–5 review passes, with one pass as the default for older profiles; the form previews a selected profile's pass count and per-pass turn limit.

Local project reviews can load and select an existing linked worktree without changing the chat workspace; a selected checkout missing from a refreshed list remains selected and blocks scheduling until the user chooses another workspace.
Agent state refreshes while the Tasks tab is active; request failures retain their admission IDs for safe retry, and each agent keeps an independent message draft until the inspector unmounts.

The Next.js client runs at `http://127.0.0.1:3001`. It connects directly to selected backends; Next.js does not proxy their APIs. See the [README](../../README.md) for setup and checks.

## Ownership

- `src/lib/backend/`: `BackendConnector` establishes a connection, `BackendClient` supplies requests/subscriptions and `ConnectionManager` owns independent client lifetimes. The current adapter is local HTTP.
- `src/components/connection-provider.tsx` and `devices/`: connection monitoring, remembered choices and browser-local bookmarks.
- `src/components/layout/`: machine rail, contextual navigation, bottom bar, shared row/menu actions and optional route-scoped details content. `workspace-sidebar.tsx` owns both sidebar slots, their mirrored clipping, resize handles, overlays and toggle controls.
- `src/components/projects/`, `providers/` and `sessions/`: backend-scoped feature state and views. Features use the connected client rather than constructing their own transport.
- `src/components/settings/`: device management and client appearance. `workspace/` contains machine workspace views.
- `src/components/ui/`: installed shadcn Base UI primitives. Reuse these before creating custom controls.
- `src/app/globals.css`: shared theme tokens, radii and scoped navigation motion; `src/app/layout.tsx` composes providers and Inter typography.
- [`public/console.svg`](../../packages/web/public/console.svg): the Interlock mark shared by the Home control and browser tab.

Paths above are relative to `packages/web`. Backend data remains backend-owned. Bookmarks, appearance and pins are client preferences; pinning never changes conversation ownership.

## Connection behavior

- Manage devices owns Add, Connect, Disconnect/Cancel, Edit and Forget. Selecting a machine only changes the viewed context; it does not connect or disconnect anything.
- Multiple backends can remain connected. Requests, monitoring and cancellation are scoped to the owning client. Reload rechecks remembered successful connections.
- Machine icons/colors are browser-local bookmark preferences, shared by the primary rail and Manage devices. Rail tooltips show name, status and URL; right-click offers the same Edit dialog as device management. Icons are labels, not detected hardware or connection methods.
- Editing a bookmark disconnects it and clears its recorded identity. Explicit reconnect accepts the new identity; duplicate connected aliases and unexpected identity changes are rejected.
- Disconnect closes that client's requests and streams without stopping backend work. Credentials for AI providers are not stored in the browser.
- Only loopback URLs are supported today. Remote access, SSH and Console authentication belong at the connection boundary and are not implemented.

## Layout and navigation

Next.js 16.4.3's bundled React runtimes use a pnpm patch to recognize Chromium's `InvalidStateError` with the `. Document hidden` suffix as a skipped view transition; updates still complete, and other errors remain reportable.
The regression test covers development, production and profiling filters; remove the patch when a Next.js upgrade includes the upstream correction.

- Primary rail: Home, all saved machines, Manage devices and Client preferences. It stays visible as a fixed 56px rail, without its own expand/collapse toggle.
- Selecting a machine restores its last conversation and tree disclosures from browser-local navigation memory. Home does not clear that state; connection choices remain independent. This restores navigation, not transcript scroll position. New-conversation drafts are scoped to the backend/project/session and kept in browser session storage until sent.
- Secondary panel: context for the selected machine or preference category. It is absent on Home/Manage devices, hideable with the bottom-left toggle and resizable while visible. Hidden navigation has no shortcut rail.
- Workspace: one content region with top and bottom insets; both side edges meet their resize boundaries without padding. The bottom bar shows current conversation identity. User prompts use right-aligned bubbles; assistant replies use unframed Markdown without repeated visible role labels.
- Each prompt starts a chronological display group. Its tool arguments/results/failures appear in a collapsed Activity sequence before its replies. The latest group shows live work. These are display groups, not independent Durable runs: steering can join an existing run. Partial history without a loaded prompt is labelled as earlier activity. Event counts are real; elapsed durations are not currently recorded or displayed.
- Ask the assistant to use the workspace reviewer. Show reviewer transcript in the parent call's Activity displays the brief, read results, and reviewer findings. The disclosure refreshes while the reviewer works. The review uses the parent model and workspace, with read-only tools. Disable `review_workspace` in Tools to turn it off for the conversation.
- The right sidebar has Project, Session and Conversation scope tabs; Conversation contains Tools, Instructions, Context and Tasks with independently scrollable cards. Execution notices remain visible for retries, provider waits, compaction, post-run work and failed or stopped runs.
- Tasks lists active work and lets you save a shell command for checks after successful file edits. Checks run after the answer, hold queued messages until they settle, and report their outcome under Activity and to the model. Set Automatic repair attempts to 1–5 to let the assistant repair failures and recheck; 0 reports results only. Shell and MCP calls also trigger checks because their file effects are unknown. Stop interrupts the check and withdraws waiting input.
- In Tasks, start a background review immediately or choose a one-time start in local time. The job keeps its scheduled time across backend restarts and uses the saved conversation model. Stop review cancels that job. Findings appear under Activity and include a reviewer transcript. Result delivery offers Display (UI only), Context (available to the next model request without starting work), or Follow up (start or queue a parent response). Context is the default for new reviews.
- Tools controls access to Durable's read, write, edit and bash for the current conversation. In an idle chat, Enter Plan mode switches to workspace reads and plan submission. The saved plan appears in Tools. Exit restores the previous tool selection and keeps the plan.
- Expand a tool for its description, typed parameters and optional scrollable JSON schema.
- Instructions edits conversation guidance, opens Project in the same sidebar for shared project guidance and links machine guidance to Preferences; older backends retain the shared inspector editors. Shared project instructions are stored in Console, separate from repository files such as `AGENTS.md`. Built-in guidance and environment details are behind a disclosure. Guidance overrides can restore their defaults. Unsaved drafts survive tab changes and background refreshes.
- Continue run is available after eligible failures and uses the saved model without sending the composer draft.
- In project and standalone chats, Fork from here creates a conversation from a saved prompt or completed reply and shows a link to it. The fork links back to its source while that conversation is available and inherits its current SSH profile, if selected. Branch links show the parent, siblings and direct children. Standalone forks have independent Recents/pinned destinations; old root bookmarks remain valid. Forks share their session’s workspace and token budget.
- In Tools, Execution workspace can attach an existing linked Git worktree to an idle project chat. The checkout becomes the working directory for tools, checks and reviewers, and the attachment persists across restarts.
- On Linux, Workspace sandbox can mount the checkout at `/workspace` with a separate filesystem and network namespace. It applies to file tools, commands and post-run checks. Plan mode and owned reviewers receive a read-only workspace mount.
- Remote execution in Tools selects a backend-configured SSH workspace for the chat's tools, checks and reviewers. Stop or finish session work before switching destinations. The selector also lets you return to local execution if the saved profile is unavailable.
- Enable Code Mode in Tools to let the assistant compose permitted tools in sandboxed JavaScript. Tool Search reveals deferred tools for later model requests. Completed scripts list nested calls under Activity. Nested tools use the selected execution workspace.
- When the backend has configured MCP servers, Tools shows their connection status and an Enable MCP action for the current chat. Discover enabled MCP tools through Tool Search or Code Mode. Reconnect servers retries disconnected connections.
- Context shows recorded usage and cost separately from estimated active context. An idle conversation can set a tool-round limit for each run.
- Context shows the shared session token budget and opens Session in the same sidebar; older backends retain the inspector editor. The budget stops new model requests once recorded usage reaches the threshold. Raise or clear it to continue work.
- Context identifies the saved conversation model and its catalog window. A different composer selection appears with its own limit under Selected for next send. Manual compaction uses the saved model. Automatic compaction and the recent-token retention target apply to the session. Manual compaction targets one conversation with optional summary guidance and preserves its transcript.
- New-chat drafts have no inspector until first send. Conversation switches retain the open panel and its width, with an accessible busy status on the solid panel surface during loading. Empty slots and their toggles stay hidden. Views register route-scoped content through `WorkspaceChromeProvider`. The last resized width is retained within the current app lifetime.
- Transcripts accumulate immutable messages by ID while mounted, retaining entries as the backend window advances. Reconnects preserve loaded history and show explicit Load missing messages boundaries when entries were missed; Load earlier fills the oldest boundary. Gap detection uses raw entry ancestry, including invisible records, rather than numeric ID adjacency. History requests are scoped to the client/conversation lifetime and merge without replacing newer streaming state. Loading history and incoming updates preserve a manually scrolled message anchor; Latest resumes following. Loaded transcript history is not cached across route remounts.
- Markdown supports lists, tables, links and fenced code blocks; embedded HTML is not executed, and Markdown images appear as links. Display modes and split panes are not implemented.
- Mobile: a compact primary rail remains visible; contextual navigation and populated details views use dismissible sheets. Layout changes must preserve the mounted conversation and unsent draft.

Machine workspace navigation starts with New conversation, opening an unsaved draft with machine/project selectors, followed by collapsible Pinned, Projects and Recents sections. A single project session is visually flattened; multiple sessions show numbered groups. Recents opens a draft outside projects. Project/session compose opens a draft in that scope; clicking or typing creates no backend entities. First send creates the conversation and submits the prompt, retaining stable creation/message identities for retries. Explicit New session still creates a session. Configuration destinations replace the workspace tree with the shared Preferences navigation, including client categories and the selected machine’s categories.

## Row actions

- Project: click its icon/name to expand; menu actions create a conversation/session, edit, pin/unpin or remove. Project compose targets Session 1; a session's compose action targets that session.
- Conversation: click to open; menu actions rename or pin/unpin. Archive runs immediately and reports progress/result in the shared toast area; busy work still requires Stop and archive. Machine settings → Archives provides restore and confirmed permanent history deletion.
- Sections: Projects offers Add project; Recents offers New conversation; all sections expand/collapse.
- Dots menus, right-click menus and inline shortcuts use the same definitions in `src/lib/navigation-actions.ts` and layout wrappers. Do not duplicate handlers or expose unsupported actions.
- Hover actions also appear on keyboard focus and remain discoverable on touch. Opening a menu shades its target without navigating; the current conversation retains a stronger selection shade. Project disclosure alone does not select it.
- Pinned items leave their original list without duplication. Unpin restores them to their owner list; ordering is not arbitrary manual sorting.
- Desktop drag supports pin/unpin only. Moving a conversation between projects or into Recents is rejected: its Durable session and execution scope cannot be changed by moving a row. Keyboard/touch use the menus.

Notifications use the shadcn Base UI Toast manager mounted once at the app root, top-center. Archive, restore and permanent conversation deletion report progress, success and failure there. Completed notices dismiss automatically (4.5 seconds; errors 7 seconds), with manual dismissal and library-managed pause on interaction. Loading notices stay until settled. Notifications do not replace destructive-action warnings or persistent field errors. Other features can use the same manager, including its promise API.

## Visual conventions

Use shared tokens and components rather than per-page themes. Both sidebars and the bottom bar share the dark outer surface; the inset workspace is slightly lighter. Hover and selected states are distinct in both themes; dark navigation uses the supplied Linear application reference (hover `#18181a`, selected `#232325`), rather than the cooler marketing-site export. Inter and Lucide are used throughout; control and workspace corners derive from the shared radius scale.

Keep row actions aligned with their parent, reserve space so labels do not jump, and preserve visible keyboard focus. Lists use continuous rows; metadata aligns with the item's text. The transcript and secondary navigation use Scroll Area; navigation reserves scrollbar clearance only when it overflows. The Latest pill overlays the transcript so appearing or disappearing cannot resize its viewport. Manual scrolling resumes automatic following only at the bottom. Reduced motion skips disclosure/panel animation. Both sidebar toggles use the same component and animate a clipping boundary around full-width content, anchored left or right, so text never rewraps during the reveal. The opposite sidebar retains its width; the workspace absorbs the change. Actual drag and keyboard resizing reflow content immediately. Native React view transitions crossfade route content and initial transcript/details reveals (180 ms complementary opacity curves), with fixed navigation and panel geometry. The workspace background stays outside the captured content; snapshots use additive blending to avoid dimming shared surfaces. No blur, color filters or geometry interpolation are used. Live streaming and background refreshes remain immediate; reduced motion disables the crossfade, and unsupported browsers use ordinary content swaps. Drag resizing is immediate, and only one animation should own a width transition.

Provider/model catalogs fill the available space and scroll independently, with starred models first and metadata behind disclosures. Only new-chat drafts show machine/project selectors. Switching destination preserves text and attachments, defaults a different machine to Outside projects, and refuses to overwrite another unsent draft; disconnected machines must first be connected through Manage devices. Pending deliveries cannot change destination. The centered composer keeps attachments on the left and model/thinking beside Send on the right. New-chat destination chips sit in a separate inset strip above the input, with no overlapping margins. The project picker lists projects like the machine menu. The selected project icon changes to × on hover or keyboard focus; clicking it clears the destination without discarding the draft; no selection shows Choose project. Destination controls have tooltips. Existing chats omit this strip. The composer combines model and thinking in one control: click the model name inside to list favorites, with model-specific thinking levels below. Unsupported thinking levels must not be offered. Each conversation restores its last submitted thinking level from the backend; selector changes stay tentative until the next message is sent. The composer stays editable during generation. Send queues a follow-up; Steer explicitly joins at the next safe boundary. Waiting inputs are listed above the composer with edit, steer and withdraw controls; stale edits are rejected once an input changes or starts. Stop interrupts this conversation and withdraws its waiting input, without stopping siblings. Model/thinking choices remain editable while working but apply only to a subsequent idle send; queued/steering input uses the active configuration. The Add menu accepts text/code files and static PNG/JPEG/WebP images, with removable previews, image paste and file drop. Limits are four files, 2 MB combined and 128 KB per text file; unsupported formats are rejected. Image submission requires an image-capable model. Draft attachments stay in browser session storage until first send; storage errors are shown rather than silently dropping a draft. Admitted attachments appear with downloadable originals in history. Permissions and plugins are not implemented. Project settings holds display metadata and on-demand Git inspection, not conversation navigation.

## Verification and limits

Tests in `test/` cover connection isolation/cancellation, remembered bookmarks, pin scope and navigation actions. Check affected views in the owner's development server after UI changes: dark/light, narrow/desktop, long names, menus, hidden panels, keyboard focus and draft retention. The existing browser checks are not a full accessibility or production-scale certification.

For a production build, run `pnpm build`, then `pnpm --filter @console/web start`. Development uses the owner's separately running `mise run dev:web`; do not restart it without permission.

Machine Archives lists individually archived conversations and archived projects, hiding empty sections. Delete all conversations confirms a snapshot of the listed conversations, retries dependent parents after deleting archived descendants, and reports partial failures; blocked items remain archived. Restore returns a conversation to its original scope. Permanent conversation deletion warns that messages, attachments and saved work state are erased; dependent forks and busy sessions block deletion. Archived projects must be restored before conversation restoration. Project archives retain their existing restore workflow; permanent project deletion is not implemented. Pending interrupted deletion cannot be restored and can be retried. Permanent deletion is not performed by the row Archive action.

## Runtime defaults

Machine settings → Runtime defaults saves the model and optional thinking level for new conversations on that backend. Connected settings pages refresh automatically and preserve unsaved edits when another client changes the defaults. New chat drafts show the eligible machine default and let users pick another model before sending.

## Commands and client preferences

- The bottom bar opens the command palette and shows its current shortcut, which defaults to Ctrl/Command+K. Search commands and saved machines. Available commands follow the current route and connection. New conversation opens a draft on the current machine and preserves the project and session scope when present.
- Selected commands run after the palette finishes closing, so popup cleanup can finish before route transitions begin.
- Client preferences → Keyboard shortcuts records bindings in a focused dialog with explicit Save and Cancel, and can remove or reset them. Labels show Ctrl or Command for the current platform, with Alt and Shift displayed explicitly. Bindings support punctuation, function/navigation keys and Alt combinations; plain typing and standard editing shortcuts remain reserved. Duplicate bindings are rejected beside the recorder. Browsers or the OS may reserve some combinations.
- The frontend command catalog and default bindings live in `src/lib/commands.ts`. Shortcut, appearance and navigation preferences use the client configuration service, which preserves the legacy `console.shortcuts.v1`, `theme` and `console.navigation.v1` values when migrating to its browser-storage envelope. Sidebar dimensions and visibility last for the open client session.
- Client preferences work offline and are shared across machines viewed in the same browser. Machine runtime defaults are saved by each backend and shared with its connected clients.

## Session runtime policies

Session runtime settings groups tool/queue behavior, retries/deadlines, compaction thresholds and progress/memory limits; each group expands independently, and older backends retain these controls in Context.
Blank numeric fields and Default selections inherit backend defaults; per-model compaction overrides use the exact provider/model ID and take precedence over basic session compaction controls.
Saving replaces the session policy for all sibling conversations and reviewers and requires the whole session to be idle; conflicting refreshes preserve the draft and require Reset draft before saving.
Restore defaults clears the saved policy, and individual model overrides can be removed without changing the rest.

## Background review settings

The Background review form can capture the chat’s saved model and thinking level or select a separate favorite model and its supported thinking level.
A review can run for 1–50 model rounds (default 6); the choice applies only to that scheduled review, and invalid limits or unavailable custom models prevent scheduling.

## Completed task history

Tasks → Completed tasks lists persisted task outcomes, ownership, start/end times and consecutive interrupted attempts; Refresh history reloads the latest page, and Load older tasks appends earlier receipts.
Review receipts open their transcript or their owned task history; Back to conversation tasks returns to the parent scope.
History excludes raw task inputs, results and provider diagnostics and loads only while the Tasks panel is active.
Failed or cancelled background reviews offer Retry review, which starts a new job with the original settings in the current workspace and retains the original receipt; ambiguous retries reuse their request identity.

## Reviewer profiles

Machine settings → Reviewer profiles creates, edits and removes backend-owned review roles; Save profiles applies the collection, and Discard edits restores its saved version.
Polling preserves unsaved drafts and blocks stale saves; each profile needs a unique name, eligible model, supported thinking level and 1–50 turn limit.
Background review → Saved profile captures the selected role’s model, thinking, instructions and turn limit; missing or unavailable profiles prevent scheduling.

Terminal task history includes fixed recovery guidance for cancellations, unavailable definitions, runtime faults and restart-limit exhaustion, without exposing raw errors or task payloads.
These receipts are terminal; replacement work does not resume them and may repeat side effects.

Active tasks labels backend-created recurring reviews and exposes Stop for their outer schedule; stopping it cancels its active occurrence as well.
Background review → Total reviews defaults to one; 2–1000 reveals an interval in whole minutes (1–525600), measured after each successful completion.
The form explains failure, overlap, missed-interval and shared-budget behavior; invalid values block scheduling, and retries retain the same request identity.

Tools shows MCP and remote-execution status even when no servers or profiles are configured, with explicit Reload MCP configuration and Reload SSH profiles actions.
Reload is disabled while this chat is busy or a settings change is pending; its description explains that shared backend connections close and calls in other chats may be interrupted.
The result refreshes the configuration and reports success or invalid configuration without exposing backend commands or credentials.

Background jobs appear in Activity, active tasks and completed history; context/follow-up delivery records are hidden to avoid duplicate result display.
Stop job cancels a pending job or recurring schedule, and Show job transcript displays its worker request, responses, tool output and execution state; open active transcripts follow progress.

Tasks → Background job schedules self-contained instructions with an optional local start time, 1–1000 total runs, a repeat interval and display/context/follow-up delivery.
The form captures the backend-saved model and tool settings, rejects invalid counts and intervals, and retains its request identity when submission has an ambiguous outcome.
Its description states that workers start fresh, share the session budget, can modify files through selected tools and capture the parent workspace policy; changed settings stop the job, and sandboxed workers can write inside their workspace.

## Agent profiles

Machine settings include Agent profiles beside Reviewer profiles, with add, edit, remove, model/thinking selection, instructions, turn limits and one enabled tool name per line.
Edits use revision checks; conflicting changes require discarding the stale draft before saving.
Background agent creation and job scheduling can select a saved profile or inherit chat configuration; a missing selected profile stays visible as unavailable rather than silently reverting to inheritance.
Profiles copy their settings at admission and cannot grant tools disabled in the parent chat.

## MCP and SSH settings

Machine settings provide validated JSON editors for MCP servers and SSH profiles, examples, explicit Save and reload actions and Reload and discard edits controls.
Saving replaces the selected machine configuration and reloads shared connections; errors preserve the draft, and stale revisions require reloading before saving again.
Malformed owner-only files can be replaced without displaying their contents; unsafe files require correction on the backend host.

## Job recovery

Completed task history offers Retry job for failed or cancelled supported jobs, including failed occurrences of a recurring schedule.
Users acknowledge that earlier file or tool effects may remain before starting one replacement; the form reports policy conflicts and links the new receipt to its source.

## Check recovery

Completed task history offers Recheck with assistant for failed, interrupted or cancelled post-run checks, with an acknowledgement that earlier effects may remain.
The action starts a model run and executes the currently configured check after its answer; it reports busy, missing-command, model and budget conflicts without discarding the original receipt.

Post-run check history shows the check result separately from task completion, including failed and interrupted checks eligible for explicit rechecking.

## Managed extensions

Machine settings → Extensions manages owner-provisioned bundles and shows the hashes actually loaded; drafts require Save and activate, and Reload saved definitions revalidates the pinned manifest.
Tools → Managed extensions selects installed definitions for the current idle conversation, preserves tool restrictions and identifies unavailable saved selections.
Plan mode suspends managed extensions; sandbox and remote execution require deselecting them first.
Blocked managed tasks link directly to extension settings for compatible-definition recovery; see the [bundle contract](../extensions.md).

## Unified commands and settings

The route-scoped command registry serves palette actions, shortcuts, core conversation buttons and selected slash commands through shared handlers.
Bindings belong to this browser across all connected backends; invocation resolves the current target, while pending operations retain their captured target.
New conversation continues to open a draft and creates backend state only on first send.

The client discovers supported backend commands on connection, uses explicit adapters for known operations and ignores unknown IDs.
A catalog 404 retains legacy controls; discovery failures show a retry action rather than implying an older backend.
Stop and Continue use the current conversation state; compaction opens a focus dialog unless invoked with form input.
Leading-slash suggestions expose `/stop`, `/continue`, `/compact` and `/settings` outside IME composition; only explicit suggestion selection executes a command, and ordinary text submission is preserved.
Skills are not part of this command milestone.

Settings identify ownership: client and machine configuration use Preferences; project, session and conversation configuration use the right sidebar.
Supported backends replace duplicated conversation editors with summaries that select the owning scope; older backends retain their inspector editors.
Backend setting controls display confirmed responses and pending/error states, with dirty drafts preserved during refresh and stale edits requiring reset.

## Browser configuration and backup

`src/lib/configuration/store.ts` centralizes persistent preferences behind a versioned, single-key browser-storage envelope and reads legacy keys until the first successful write.
Appearance, shortcuts, bookmarks, pins, navigation and imported themes use this service, with notifications across mounted clients and browser tabs.
Client preferences → Configuration backup exports versioned JSON and previews a complete replacement before importing; unsupported versions, invalid shortcuts, conflicts and invalid themes leave saved preferences unchanged.
Undo import restores the previous configuration during the current page lifetime; imports and undo disconnect machines and require explicit reconnection, without trusting imported backend identities.
Exports omit backend settings, credentials, transcripts, drafts and remembered/active connections.

Appearance separates display mode (System, Light or Dark) from independently selected light and dark palettes.
System follows operating-system changes; choosing an inactive mode’s palette saves its default without changing the displayed interface, while active-mode selections apply after successful storage.
The full-width gallery groups 19 themes into Console, Catppuccin (Latte, Mocha, Frappé, Macchiato), Tokyo Night (Night, Storm, Moon, Day), Nord, Dracula, Solarized (Light/Dark), Gruvbox (Light/Dark) and Rosé Pine (Main, Moon, Dawn) families.
Background-colored variant tabs choose that mode’s default, with names on hover and keyboard focus; a border identifies the selected palette without a duplicate tick.
Every card uses one aligned footer row: variant selectors on the left, All colors and download on the right; preference category headings use stronger contrast.
Labeled Surfaces, Text & actions, Borders and Navigation strips cover all 29 exported tokens, combining repeated colors within each group.
All colors opens the complete token list with each role and hex value, including roles that share colors; it inspects without applying a theme.
Console adapts colors from [Catppuccin](https://catppuccin.com/palette/), [Tokyo Night](https://github.com/tokyo-night/tokyo-night-vscode-theme), [Nord](https://www.nordtheme.com/) [Dracula](https://draculatheme.com/contribute), [Solarized](https://ethanschoonover.com/solarized/), [Gruvbox](https://github.com/morhetz/gruvbox) and [Rosé Pine](https://rosepinetheme.com/palette/) to its semantic interface tokens; these are Console adaptations rather than official ports.

Each download is complete, importable JSON with a `custom-` ID, name, light/dark mode and supported tokens mapped to six-digit hex colors, including navigation surfaces.
Import themes accepts one file through the picker or drag and drop, validates it before saving, caps files at 64 KB and preserves existing preferences on errors.
Imported themes join the appropriate gallery without automatically applying; partial token maps inherit Console’s matching base palette, and changing the mode of a currently selected imported theme is rejected.
Theme import does not execute code or accept arbitrary CSS.

Version 2 configuration backups include display mode, both selected palettes and imported definitions; version 1 backups and existing single-theme preferences migrate without losing their selected palette.
Storage/import failures retain confirmed preferences, and applied changes synchronize across browser tabs.
Browser storage can be cleared by users or browser policy; downloaded backups are user-managed, and no native companion or configuration directory is used.

## Central Preferences

`/settings` lists Client and Machine categories without machine dropdowns or browser ownership labels.
Each machine category shows a row of prominent machine cards above its settings; selecting a card keeps the current category and changes only the viewed machine, without connecting it or starting work.
Cards show connection status and the selected machine; client pages have no machine cards.
Category navigation retains a saved selection or uses the first saved machine, and categories remain visible when no machines exist, with a Manage devices link instead of an editor.
The far-left rail is the single Preferences entry point; device navigation does not duplicate it, and settings pages omit the redundant All preferences row and breadcrumb.
Preferences navigation lists client and machine categories; older project, session and conversation settings deep links remain valid for compatibility.
The assigned Open settings shortcut always opens this hub, including from text fields, with the current machine selected and unchanged keybindings.

## Workspace configuration sidebar

Project, Session and Conversation tabs switch configuration in the right sidebar without leaving the chat; standalone sessions omit Project, and Session represents the harness rather than adding another scope.
Project exposes metadata, repository inspection, shared guidance, evidence rules and default tools; Session exposes shared token budgets, compaction and runtime policies; Conversation retains its existing Tools, Instructions, Context and Tasks controls.
Scope descriptions identify affected conversations and workers, and existing backend validation, idle requirements, revisions and confirmed responses remain authoritative.
Command-palette project/session settings actions select the corresponding sidebar tab; conversation configuration selects Conversation and opens the panel.

The selected scope and conversation subsection are remembered independently for each backend identity, session and conversation in browser configuration, restored after closing or reloading and included in navigation backups.
Scope panels stay mounted during tab changes so dirty form drafts survive switching scopes and background refreshes; drafts are not persisted across reloads.
Older backends keep their conversation-based shared editors, and unsupported restored subsections fall back to Tools.
