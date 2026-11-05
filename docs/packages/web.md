# Web

A Next.js/React client at `http://127.0.0.1:3001/` with a full-width shadcn Base UI sidebar and resizable desktop panels.

## Routes and workflow

- `/`: cross-device overview showing saved devices, independent connection states and summary counts.
- `/devices/[deviceId]`: selected device workspace.
- `/devices/[deviceId]/settings`: redirects to provider settings.
- `/devices/[deviceId]/settings/providers`: provider sign-in/enable/remove, model metadata and favorites.
- `/devices/[deviceId]/conversations/[sessionId]`: standalone Durable conversation.
- `/settings`: redirects to Appearance.
- `/devices`: browser-local bookmarks, search, connect/disconnect, edit, forget and Add device.
- `/devices/new`: name and local URL form; returns to Manage devices without connecting.
- `/settings/connections` and `/settings/connections/new`: redirect to the new device routes.
- `/settings/appearance`: System, Light and Dark theme selection.

Two navigation columns separate scope. The client column animates between 256px expanded and 56px collapsed over 200ms,
respecting reduced motion and clipping overflow.
It lists all devices and keeps Home, Manage devices and Client preferences accessible. Device rows
show initials/name and status dots; clicking navigates only, with no inline metadata expansion.
Manage devices owns connection actions and editing. Home shows saved/connected/error counts.
Selecting a device never connects it or disconnects another machine.

The adjacent backend panel shows its registered project list and standalone conversations and Machine
settings. Selecting Preferences instead places the Appearance category in the second column.
Projects are directory registrations with Durable sessions. Uptime and
connected-client metrics are unavailable and are not simulated.

The context column is absent on Home. With navigation shown, device/Preferences contexts open
expanded and retain a 208–384px resizable width. The 36px bottom status bar has one fixed left control
to hide/show only the secondary navigation; hidden navigation is inert and cannot be resized.
The device column still expands independently between 56 and 256px. No compact workspace shortcut
rail remains. Width transitions last 200ms and respect reduced motion. Resizable flex transitions run only for
secondary-navigation visibility changes, not while Activity changes the available width.
Mobile keeps the device rail visible and opens the secondary navigation in an adjacent sheet.

The bar identifies the active conversation and exposes Activity on the right. Activity is an
independently hideable 300px sidebar on viewports at least 1200px wide; narrower screens use an
explicitly opened sheet. It renders the existing snapshot's tool activity and loaded history,
including arguments, results/failures and busy/queued state. It does not open another subscription.
The transcript remains unchanged; Clean/Compact/Detailed modes and workspace splits are deferred.
The old visible conversation heading is replaced by its bar identity; an accessible h1 remains.

Navigation, Activity and the status bar share one shell surface without divider borders; in dark mode
the shell is darker than the inset workspace. Dashed tree elbows terminate at the last sibling and connect
conversations, subagents and forks. Expanding a tree node does not shade it; hover and selected
conversation backgrounds are separate. Remaining borders default to dashed strokes; selection uses backgrounds and focus rings stay visible.
The right pane is route content today; split conversations and file/code/Markdown views remain future work.

Device names and URLs are stored in this browser, not the backend. Reload preserves bookmarks
and appearance and rechecks every remembered successful connection. Navigation preserves all connections.
A connected browser checks every five seconds; checks time out after five seconds. Disconnect
or forgetting a device aborts requests without stopping the backend. No token or API
cookie is used; only loopback URLs are accepted. Corrupt bookmark storage is not overwritten.

## UI foundation

The official CLI installed the user-selected preset `bddBUJXM`: Base UI Lyra, Zinc, Geist and
Lucide. The theme uses a 10px base radius with smaller controls/menu items and larger popup/composer shells. `components.json` configures future component installs;
use library components from `src/components/ui` before creating a custom primitive.

`src/components/layout` owns the shell/sidebar, `devices` owns bookmark state, `workspace` owns machine views and project navigation,
and `settings` owns saved-device management, Add device and Appearance views. `connection-provider.tsx` owns connection lifecycle. Shared validation
lives in `src/lib/connection.ts` and `src/lib/devices.ts`. See [architecture](../architecture.md).

For another component, run `pnpm dlx shadcn@latest add <component> --cwd packages/web` from the root.
Generated code still needs repository formatting and checks. Match the shared radius scale; do not reintroduce hardcoded square controls.

## Commands and verification

After the [shared setup](../../README.md#development), run `mise run dev:web` separately.
Production uses `pnpm build`, then `pnpm --filter @console/web start`.
Next.js provides native output. Do not start, stop or restart the owner's development servers.

Client tests cover connection policy and bookmark validation. Types/build check integration.
Manual browser checks cover saved-device navigation/search/connect, reload persistence, pointer/keyboard resizing,
global navigation hiding, route-dependent context visibility, expanded context entry, navigation-only device rows, Manage devices, Home overview, width restoration, project registration/navigation, client/device scope switching, category navigation, theme controls and mobile navigation. There is no automated browser suite or cross-tab merge protocol.
See [README](../../README.md#checks) for shared checks.

## AI provider settings

Use Manage devices to connect/disconnect each machine independently. Machine settings switches
second-column content from the project tree to Providers/Projects categories; Back to workspace restores projects.
The settings route opens Providers directly. Device identity/URL and provider-count shortcuts are
not duplicated in the second column.

Search the catalog and choose a provider. Its API-key/subscription buttons start the methods Pi AI
actually offers. A dialog renders backend-owned secret/text/choice/code prompts and external HTTPS
sign-in links. Cancel stops the pending operation; no credential is stored in localStorage. Secrets
are never populated back into the page. Disconnect provider retains credentials/favorites; Remove
clears local backend configuration and does not revoke an upstream grant.

Models show catalog context/output sizes, inputs, thinking levels and token pricing. Stars persist
on the backend; only available favorites from enabled providers are returned by the model-picker
API. The composer selects favorite models and that model's supported thinking levels. Metadata and configured status do not verify account entitlement.
The provider overview polls every ten seconds; login steps poll sequentially with cancellation and
backend-origin scoping. Real provider credentials/OAuth completion require user verification.

Provider settings use shadcn Scroll Area for both catalogs. On desktop, each list fills the
remaining content-pane height and scrolls independently; smaller screens stack the catalogs.
Model rows are contiguous and borderless. Search fields use shaded backgrounds
without borders, retaining keyboard focus indicators.

Catalog scrollbars hide when idle and appear on hover or keyboard focus. The provider list
reserves extra right padding so model counts remain clear of the scrollbar.

Starred models sort first within the selected provider, preserving catalog order within each group.
Expanded details align with the model name and group prominent token limits, capabilities and
secondary catalog pricing (input/output/cache read/cache write). Model rows have no separators.

The desktop provider catalog is 320px wide. Provider and model names share the same text size
and weight; metadata remains secondary.

Workspace navigation uses collapsible Pinned, Projects and Recents sections. The Recents header
creates a standalone Durable session and opens its chat. Pinned projects and individual chats move
into Pinned without duplicates; unpinned projects retain backend order and Recents stays newest first.

Standalone creation belongs to the Recents header action; there is no top-level New conversation button.
Hidden workspace navigation exposes no shortcuts; the top-bar toggle reopens it. The footer uses the label Machine settings.

## Register a project

Connect a machine using Manage devices. Use Add project beside Projects (or the plus
in the compact workspace rail), enter a name and an absolute existing directory path on that machine,
and register it. Both sidebar modes show real registrations. Expand a project row for its sessions; use right-click → Edit for name/icon/color, an inline path/status dot, metadata refresh and Git inspection. Archive asks for confirmation and preserves all files and chat history. Restore from Machine settings → Projects → Archive. Missing directories are retained
as unavailable. Reload rechecks the remembered device before displaying it as connected.

Project routes: `/devices/[deviceId]/projects/new` and `/devices/[deviceId]/projects/[projectId]`.
Project appearance settings and Durable sessions with read-only inspection are implemented. The shared backend
request hook handles provider and project requests; project state is isolated by connected origin.

## Add project modes

Machine settings → Projects configures the machine projects folder (backend `~/Projects` initially).
The Add project screen uses shadcn Tabs: Existing directory registers a path; New project initializes
Git under the default folder; Clone repository accepts a public HTTPS Git URL and clones there.
Names/folder names are suggested, editable, and previewed as the final destination. Existing paths
can live outside the default root. Create missing parent folders is an explicit checkbox; collisions
show errors rather than overwrite. Clone uses no ambient machine credentials; private Git login is
future work. Cancel setup aborts the HTTP operation. Closing/reloading can interrupt setup, so check
the destination before retrying. No initial commit, submodule setup or Git pull is offered.

Project settings use `/devices/[deviceId]/projects/[projectId]/settings`. Name, icon and color persist on the backend; directory paths cannot be changed here. The Add project desktop form/destination columns use a 2:1 ratio.

Project settings loads a read-only Git snapshot on entry and explicit refresh: current branch, collapsible local branch list/count and worktree paths/branches/count. The status square beside the Directory label is green for accessible and red for unavailable, with an accessible label and hover description. It does not imply Git health. Git state is not polled with project registration lists. No remote branch discovery or history is shown.

Project settings spans the content pane. Its top-right removal action retains confirmation and preserves files. Name/icon editing occupies the first column beside directory details; narrow content panes stack these columns; the name input uses a shaded surface and one inset focus indicator. The picker provides 32 searchable icons and eight colors. Git branches and worktrees use separate shaded sections (side by side on desktop), with blue squares marking current items, heading-sized counts and one explicit Refresh action.

The project header shows only the project name and a red Remove action with a trash icon. Remove removes the registration only; confirmation states that files stay on the machine. The main worktree uses the display label Main; linked worktrees use directory names. The compact list omits per-worktree branch lines. Redundant Git summary/current-branch lines are omitted. Current list items retain accessible current-state semantics.

Save changes appears in the header immediately before Remove only when the name/icon/color differs from the last saved values; reverting an edit hides it. The header button submits the associated form, preserving keyboard validation. The refresh icon beside the project name reloads directory and Git metadata and is disabled while that snapshot loads. Current worktrees use the same shaded background and blue square as current branches.

Project entries in both sidebar modes use the official shadcn Base UI Context Menu: Edit opens settings, Pin to top/Unpin changes browser-local ordering, and Remove opens a shared confirmation dialog. The gear is removed. Shift+F10 or the keyboard context-menu key on a focused entry provides keyboard access; Base UI supplies touch long-press behavior. Pinned rows omit redundant pin badges; compact entries include pinned state in their tooltip.

`console.project-pins.v1` stores project IDs grouped by backend URL. Newest pins come first, then unchanged backend order; unknown IDs are ignored. Invalid storage is reported and left untouched, and failed writes preserve in-memory state. Pins persist across reload; they are not shared with other clients or synchronized across tabs. `test/project-pins.test.ts` checks parsing, round-trip persistence, backend isolation and ordering.

Browser verification covered expanded/compact right-click menus, Shift+F10, Edit navigation, pin ordering/persistence after reload and reconnect, Unpin, shared removal confirmation/cancel, and removal disabled while disconnected. A temporary registration was unpinned and cleaned up; source-file preservation was verified through the backend API. Touch long-press was not manually verified.

Context-menu triggers retain a flex-column layout: compact action buttons keep their automatic horizontal margins, matching the rail icon center, while expanded project rows stretch to the panel width.

## Project sessions and conversations

The tree is project → Session N → conversations. Each session is backed by one Durable Harness;
there is no duplicate harness row. Projects get Session 1/Main automatically on registration and
startup backfills missing defaults. Right-click a project → New session opens the next numbered
session's Main. Right-click a session → New conversation, or use its plus, to open Conversation 2,
Conversation 3, etc. Creation requires neither a name nor a model dialog.

The real chat route is `/devices/[deviceId]/projects/[projectId]/sessions/[sessionId]/conversations/[conversationId]`.
The composer contains one text surface, model selector, model-dependent thinking selector and a
square arrow button with an accessible submit/queue/retry label. Enter sends; Shift+Enter inserts
a newline. Changing model resets thinking to a supported choice; non-reasoning models hide that
selector. Controls are locked while the conversation is working/queued or delivery is pending.
Choices are persisted by the backend when sending. No attachment/slash-command placeholders exist.

The header omits Live and Stop session. Connection failures remain visible. The shared Scroll Area
owns the transcript; Jump to latest appears only when scrolled more than 64 pixels above the bottom
and disappears at the bottom. Short conversations have no jump control. HTTP admits messages; SSE
shows committed text and partial answers. Browser close only detaches observation. Uncertain delivery
retains content, model/thinking choices and request ID in sessionStorage for explicit Retry.

Reload rechecks the remembered connection; reconnect restores saved history. Load earlier pages history.
Markdown, attachments, write/process tools, forks, subagents and automatic history-gap filling remain
deferred. Session lists refresh after local creation and poll every ten seconds. Unknown/other-project
sessions cannot be displayed through a mismatched project route. Standalone conversations use the same chat at
`/devices/[deviceId]/conversations/[sessionId]`. The backend Stop API remains session-wide, with no chat control.
When an archive attempt finds running or queued work, the dialog offers Stop all and archive.

## Connection boundary

`lib/backend/client.ts` defines BackendConnector and BackendClient. ConnectionProvider accepts
a connector and owns the lifetime of its returned client. The default `local-http.ts` connector
owns the handshake, requests and EventSource subscriptions. `useBackendRequest` delegates
commands; `useConversation` consumes subscriptions. Switching or disconnecting closes both.
The remembered bookmark is rechecked on reload.

Future tunnel/authentication integrations implement the connection contracts and extend bookmark
configuration where needed. Current supported endpoints remain loopback HTTP/HTTPS. Feature hooks
consume paths and snapshots independent of how the connection was established.

## Project tool activity

Project chat displays inspection call arguments and completed/failed result previews using shadcn
Collapsible, plus an active-tool status during inspection. Results persist through existing history
and reconnect APIs. Result previews are limited to 4,000 characters and mark truncation; model tool
results retain the executor's larger bounded output. No source viewer or shell console is added.
Live-provider tool choice and interactive disclosure visuals still require manual verification.

## Project and conversation actions

With one session, project disclosure shows conversations directly. Additional sessions reveal
numbered group headings with compose and dots menus. Project compose always creates in Session 1;
group compose creates in its own session. New session preserves the current chat selection.
Project dots/right-click menus share New conversation, New session, Pin/Unpin, Edit and Remove.
Remove retains the existing archive confirmation and recovery path.

Project and Recents conversation rows share Rename and Pin/Unpin menus. Rename is backend-owned;
conversation pins are browser-local in console.conversation-pins.v1, scoped by backend URL and
session/conversation ID. Pinned chats appear only in machine Pinned; remaining source order stays unchanged.
Actions share row hover backgrounds, appear on hover or keyboard focus and remain visible while a menu is open or on touch screens.
Refreshes retain loaded session metadata and keep the chat mounted, preserving unsent drafts.

Conversation controls are 28px high with 2px between adjacent row surfaces; project headings are
32px high, with 4px disclosure clearance.
Only hover/selection shade the row; keyboard focus retains a ring without latching its background.
Inline actions use 24px controls/14px icons; compact device controls use 32px surfaces within the
existing 36px vertical slot. Scroll Area thumbs and native WebKit thumbs have rounded ends.

Sidebar actions use block flex layout so auto margins center compact links and avoid inline baseline
spacing. Rail header anchors share the full 56px width. Pointer clicks retain focus without latching
actions visible; :focus-visible reveals actions for keyboard users.

Project rows toggle by clicking the icon/name without a chevron, and hover rather than remain
highlighted for an active child. Only the selected conversation retains a background. Expanded
conversation rows use text without a leading icon. Child text
aligns with its parent label, reclaiming horizontal space for conversation names.

Project conversation lists use the existing Base UI Collapsible with a scoped 180ms height reveal
and 140ms fade, including collapse. Reduced motion skips both. The icon/name remains the trigger;
there is no chevron or persistent project selection. Git/model/tool collapsibles are unaffected.

## Workspace section navigation

Pinned, Projects and Recents are independent animated sections, initially open. Projects Add and
Recents compose actions reveal on header hover/keyboard focus and stay available on touch.
Pinned projects and individual chats move out of their regular list; Unpin restores source order.
Pinned projects precede pinned standalone chats, with newest pins first within each kind. Project
conversation pins appear in Pinned without changing their owning session. Section disclosure state is not saved across reload.
There is no top-level New conversation button; use the Recents header action to create outside projects.
Machine status dots sit bottom-right on compact badges and at the trailing edge of expanded rows,
with connection state in accessible names/tooltips. Status does not change connection behavior.

## Navigation contract and dragging

See [navigation actions](../navigation-actions.md) for the entity/action matrix. Dots and right-click
menus share action definitions and temporary target highlighting; primary shortcuts derive from the
same definitions. Section headers rotate chevrons. No redundant pin badges are rendered.
Desktop drag pins projects/chats, unpins projects into Projects, standalone chats into Recents, and
project chats onto their owning project row. Unsupported ownership moves show feedback and retain
history/context. Touch and keyboard use menus; arbitrary ordering is deferred. Pinned project chats
resolve metadata without expanding their project and do not duplicate in the source session list.

Navigation hover/menu targets use `--sidebar-hover`; selected rows use `--sidebar-selected`.
Selection stays stronger during hover and menu opening. Shared inline actions do not add a
second full-row surface.
