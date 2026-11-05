# Web

The Next.js client runs at `http://127.0.0.1:3001`. It connects directly to selected backends; Next.js does not proxy their APIs. See the [README](../../README.md) for setup and checks.

## Ownership

- `src/lib/backend/`: `BackendConnector` establishes a connection, `BackendClient` supplies requests/subscriptions and `ConnectionManager` owns independent client lifetimes. The current adapter is local HTTP.
- `src/components/connection-provider.tsx` and `devices/`: connection monitoring, remembered choices and browser-local bookmarks.
- `src/components/layout/`: machine rail, contextual navigation, bottom bar, shared row/menu actions and Activity portal host.
- `src/components/projects/`, `providers/` and `sessions/`: backend-scoped feature state and views. Features use the connected client rather than constructing their own transport.
- `src/components/settings/`: device management and client appearance. `workspace/` contains machine workspace views.
- `src/components/ui/`: installed shadcn Base UI primitives. Reuse these before creating custom controls.
- `src/app/globals.css`: shared theme tokens, radii and scoped navigation motion; `src/app/layout.tsx` composes providers and Inter typography.

Paths above are relative to `packages/web`. Backend data remains backend-owned. Bookmarks, appearance and pins are client preferences; pinning never changes conversation ownership.

## Connection behavior

- Manage devices owns Add, Connect, Disconnect/Cancel, Edit and Forget. Selecting a machine only changes the viewed context; it does not connect or disconnect anything.
- Multiple backends can remain connected. Requests, monitoring and cancellation are scoped to the owning client. Reload rechecks remembered successful connections.
- Machine icons/colors are browser-local bookmark preferences, shared by the primary rail and Manage devices. Rail tooltips show name, status and URL; right-click offers the same Edit dialog as device management. Icons are labels, not detected hardware or connection methods.
- Editing a bookmark disconnects it and clears its recorded identity. Explicit reconnect accepts the new identity; duplicate connected aliases and unexpected identity changes are rejected.
- Disconnect closes that client's requests and streams without stopping backend work. Credentials for AI providers are not stored in the browser.
- Only loopback URLs are supported today. Remote access, SSH and Console authentication belong at the connection boundary and are not implemented.

## Layout and navigation

- Primary rail: Home, all saved machines, Manage devices and Client preferences. It stays visible as a fixed 56px rail, without its own expand/collapse toggle.
- Selecting a machine restores its last conversation and tree disclosures from browser-local navigation memory. Home does not clear that state; connection choices remain independent. This restores navigation, not transcript scroll position. New-conversation drafts are scoped to the backend/project/session and kept in browser session storage until sent.
- Secondary panel: context for the selected machine or preference category. It is absent on Home/Manage devices, hideable with the bottom-left toggle and resizable while visible. Hidden navigation has no shortcut rail.
- Workspace: one inset content region. The bottom bar shows current conversation identity; the bottom-right control toggles Activity when a conversation is open.
- Activity: tool arguments/results/failures and busy/queued state from the existing conversation stream. It has its own scroll area and uses a drawer below 1200px. The transcript still includes tool disclosures; display modes and split panes are not implemented.
- Mobile: a compact primary rail remains visible; contextual navigation and Activity use dismissible sheets. Layout changes must preserve the mounted conversation and unsent draft.

Machine workspace navigation contains collapsible Pinned, Projects and Recents sections. A single project session is visually flattened; multiple sessions show numbered groups. Recents opens a draft outside projects. Project/session compose opens a draft in that scope; clicking or typing creates no backend entities. First send creates the conversation and submits the prompt, retaining stable creation/message identities for retries. Explicit New session still creates a session. Machine settings replaces the tree with Providers/Projects categories; client Preferences uses its own categories.

## Row actions

- Project: click its icon/name to expand; menu actions create a conversation/session, edit, pin/unpin or remove. Project compose targets Session 1; a session's compose action targets that session.
- Conversation: click to open; menu actions rename or pin/unpin. Conversation removal is unavailable until a backend lifecycle operation exists.
- Sections: Projects offers Add project; Recents offers New conversation; all sections expand/collapse.
- Dots menus, right-click menus and inline shortcuts use the same definitions in `src/lib/navigation-actions.ts` and layout wrappers. Do not duplicate handlers or expose unsupported actions.
- Hover actions also appear on keyboard focus and remain discoverable on touch. Opening a menu shades its target without navigating; the current conversation retains a stronger selection shade. Project disclosure alone does not select it.
- Pinned items leave their original list without duplication. Unpin restores them to their owner list; ordering is not arbitrary manual sorting.
- Desktop drag supports pin/unpin only. Moving a conversation between projects or into Recents is rejected: its Durable session and execution scope cannot be changed by moving a row. Keyboard/touch use the menus.

## Visual conventions

Use shared tokens and components rather than per-page themes. Both sidebars and the bottom bar share the dark outer surface; the inset workspace is slightly lighter. Hover and selected states are distinct in both themes; dark navigation uses the supplied Linear application reference (hover `#18181a`, selected `#232325`), rather than the cooler marketing-site export. Inter and Lucide are used throughout; control and workspace corners derive from the shared radius scale.

Keep row actions aligned with their parent, reserve space so labels do not jump, and preserve visible keyboard focus. Lists use continuous rows; metadata aligns with the item's text. The transcript and secondary navigation use Scroll Area; navigation reserves scrollbar clearance only when it overflows. The Latest pill overlays the transcript so appearing or disappearing cannot resize its viewport. Manual scrolling resumes automatic following only at the bottom. Reduced motion skips disclosure/panel animation. Drag resizing is immediate, and only one animation should own a width transition.

Provider/model catalogs fill the available space and scroll independently, with starred models first and metadata behind disclosures. Only new-chat drafts show machine/project selectors. Switching destination preserves text and attachments, defaults a different machine to Outside projects, and refuses to overwrite another unsent draft; disconnected machines must first be connected through Manage devices. Pending deliveries cannot change destination. The centered composer keeps attachments on the left and model/thinking beside Send on the right. New-chat destination chips sit in a separate inset strip above the input, with no overlapping margins. The project picker lists projects like the machine menu. The selected project icon changes to × on hover or keyboard focus; clicking it clears the destination without discarding the draft; no selection shows Choose project. Destination controls have tooltips. Existing chats omit this strip. The composer combines model and thinking in one control: click the model name inside to list favorites, with model-specific thinking levels below. Unsupported thinking levels must not be offered. Each conversation restores its last submitted thinking level from the backend; selector changes stay tentative until the next message is sent. Busy messages queue; they do not steer the active run. The Add menu accepts text/code files and static PNG/JPEG/WebP images, with removable previews, image paste and file drop. Limits are four files, 2 MB combined and 128 KB per text file; unsupported formats are rejected. Image submission requires an image-capable model. Draft attachments stay in browser session storage until first send; storage errors are shown rather than silently dropping a draft. Admitted attachments appear with downloadable originals in history. Permissions, plugins and context-usage telemetry are not implemented. Project settings holds display metadata and on-demand Git inspection, not conversation navigation.

## Verification and limits

Tests in `test/` cover connection isolation/cancellation, remembered bookmarks, pin scope and navigation actions. Check affected views in the owner's development server after UI changes: dark/light, narrow/desktop, long names, menus, hidden panels, keyboard focus and draft retention. The existing browser checks are not a full accessibility or production-scale certification.

For a production build, run `pnpm build`, then `pnpm --filter @console/web start`. Development uses the owner's separately running `mise run dev:web`; do not restart it without permission.
