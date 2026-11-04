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
show initials/name and status squares; clicking navigates only, with no inline metadata expansion.
Manage devices owns connection actions and editing. Home shows saved/connected/error counts.
Selecting a device never connects it or disconnects another machine.

The adjacent backend panel shows its registered project list and standalone conversations and Machine
settings. Selecting Preferences instead places the Appearance category in the second column.
Projects are directory registrations with Durable sessions. Uptime and
connected-client metrics are unavailable and are not simulated.

The context column is absent on Home, animating its occupied width to zero without translating
content. Entering a device or Preferences starts it collapsed to a 56px icon rail. Within that
context its state is preserved, including when the primary column is toggled. Desktop expansion
is pointer/keyboard-resizable between 208 and 384px and restores the last expanded width.
The compact resize separator is disabled and has no resize hit area; expand with the toggle first.
Expanded dragging cannot collapse the panel or stretch a compact rail into a blank wide column.

Both chevron toggles retain their top-left position. Width transitions last 200ms, skip reduced
motion and are disabled during pointer resizing. Mobile uses context sheets and hides its compact
context rail on Home. Preference categories remain accessible from the compact contextual rail.
There is no navigation toolbar in the content pane.
Columns use different surface tones rather than divider borders; in dark mode the client column
is lightest and content darkest. Dashed tree elbows terminate at the last sibling and connect
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
Lucide. The theme radius is set to zero. `components.json` configures future component installs;
use library components from `src/components/ui` before creating a custom primitive.

`src/components/layout` owns the shell/sidebar, `devices` owns bookmark state, `workspace` owns machine views and project navigation,
and `settings` owns saved-device management, Add device and Appearance views. `connection-provider.tsx` owns connection lifecycle. Shared validation
lives in `src/lib/connection.ts` and `src/lib/devices.ts`. See [architecture](../architecture.md).

For another component, run `pnpm dlx shadcn@latest add <component> --cwd packages/web` from the root.
Generated code still needs repository formatting and checks. Match the zero-radius theme.

## Commands and verification

After the [shared setup](../../README.md#development), run `mise run dev:web` separately.
Production uses `pnpm build`, then `pnpm --filter @console/web start`.
Next.js provides native output. Do not start, stop or restart the owner's development servers.

Client tests cover connection policy and bookmark validation. Types/build check integration.
Manual browser checks cover saved-device navigation/search/connect, reload persistence, pointer/keyboard resizing,
independent column collapse, route-dependent context visibility, initially collapsed context entry, navigation-only device rows, Manage devices, Home overview, width restoration, project registration/navigation, client/device scope switching, category navigation, theme controls and mobile navigation. There is no automated browser suite or cross-tab merge protocol.
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

Workspace navigation separates Projects from Recents. New conversation creates one standalone
Durable session on the connected machine and opens its chat immediately. Recents lists those
conversations newest first. Project rows expand in place and their context menu opens settings.

The workspace New conversation action aligns vertically with Home in the primary column.
Collapsed workspace navigation exposes direct project and conversation shortcuts; only the top
chevron expands the panel. The footer uses the label Machine settings.

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

Project entries in both sidebar modes use the official shadcn Base UI Context Menu: Edit opens settings, Pin to top/Unpin changes browser-local ordering, and Remove opens a shared confirmation dialog. The gear is removed. Shift+F10 or the keyboard context-menu key on a focused entry provides keyboard access; Base UI supplies touch long-press behavior. Expanded pinned rows show a pin icon; compact entries include pinned state in their tooltip.

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
