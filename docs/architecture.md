# Architecture

The browser connects directly to the selected backend. Next.js serves the website and does not
proxy API requests or choose a backend on the user's behalf.

```text
Browser → Next.js (127.0.0.1:3001) → Home / Preferences categories
Browser → selected loopback backend → GET /v1/connection
```

## Ownership

| File | Responsibility |
| --- | --- |
| `packages/server/src/app.ts` | Fastify routes and explicit browser-origin/CORS policy. |
| `packages/server/src/main.ts` | Listen on loopback, native logging and graceful shutdown. |
| `packages/web/src/lib/connection.ts` | URL validation, bounded-duration fetch and response validation. |
| `packages/web/src/components/connection-provider.tsx` | Connection state, monitoring and cancellation. |
| `packages/web/src/components/settings/` | Browser bookmark management, add-device form and Appearance views. |
| `packages/web/src/components/layout/` | Expandable client/device column, resizable backend context panel, compact rails and shared actions. |
| `packages/web/src/components/devices/` | Browser-local device bookmark state. |
| `packages/web/src/lib/devices.ts` | Bookmark validation, URL normalization and duplicate rejection. |
| `packages/web/src/components/workspace/` | Device workspace, connection settings and explicitly simulated project hierarchy. |
| `packages/web/src/components/ui/` | CLI-installed shadcn Base UI components; no custom primitive library. |
| `packages/web/src/components/home.tsx` | Cross-device overview of saved bookmarks and current connection status. |
| `packages/web/src/app/layout.tsx` | Shared navigation and connection provider. |
| `packages/web/src/app/globals.css` | Preset tokens and Tailwind integration; zero radius and Geist typography. |

The connection provider starts disconnected and holds the selected origin only in memory. Explicit
Connect validates the URL and checks the API. Each successful check schedules another after five
seconds; checks time out after five seconds. Disconnect, replacement and unmount abort obsolete
requests so they cannot restore an old connection. Failure stops monitoring; reconnect is explicit.
The provider persists across Next.js navigation, not browser reloads.

## Connection boundary

The client accepts HTTP or HTTPS origins on `localhost`, `127.0.0.1` and `[::1]`, with a port as
needed. Paths, query strings, fragments and embedded credentials are rejected. The default server
listens on IPv4 loopback; an IPv6 URL works only if the chosen backend actually listens there.
Fetch omits cookies, disables caching and refuses redirects. The response identifies the Console
protocol, not a cryptographically authenticated server identity.

Fastify permits only `http://127.0.0.1:3001` and `http://localhost:3001` as browser origins.
Requests with other Origin headers are rejected; nonbrowser clients without Origin remain allowed.
There is no authentication or persistence. Future API authentication belongs at the backend request
boundary; a website sign-in library alone would not protect Fastify. SSH would be a transport,
while the connection client remains the single browser request boundary.

The root `dev:server` and `dev:web` scripts are also separate Mise tasks. Node watch mode restarts
the backend on source edits; Next.js owns web hot reload. No custom launcher is installed.

## Frontend shell and saved devices

`AppShell` separates primary client navigation from a route-dependent context column and content.
`DeviceRail` owns the primary column: 256px expanded, 56px compact, with inline shadcn Collapsible
metadata. Its width animates over 200ms with overflow clipped and reduced motion respected;
the toggle stays anchored. Home has no context column. Each device and Preferences is a distinct context; entering
one starts with the 56px compact context rail. Navigation within the same context preserves its state.

The desktop context uses shadcn Resizable (208–384px expanded, 256px initially) and preserves its
pixel width when the primary column resizes. Only explicit toggle actions update open state; separator interaction adjusts expanded width,
and ordinary container resizes cannot change open state. This avoids a resize
callback feeding layout changes back into navigation state. Dragging saves the expanded width. The compact separator is disabled for pointer/keyboard input
and loses its extended hit area. Expanded dragging cannot snap into the compact state: it remains
within 208–384px, and the toggle owns collapse. Imperative resize commands run on the next animation
frame after the library commits updated collapsible constraints.

The context's outer flex item animates its occupied width over 200ms, retracting its right edge
rather than translating the content. Home sets the collapsed size to zero; hidden navigation is
inert and excluded from accessibility. CSS targets the library's outer panel because its className
prop styles an inner element. The navigation panel explicitly sets inline overflow to hidden,
overriding the library's default overflow:auto so the width transition cannot flash a scrollbar.
The sidebar content owns normal vertical scrolling. Dragging disables transitions, and reduced motion skips animation.

Both chevron toggles retain their top-left anchor. The content pane has no shell toolbar. Mobile
keeps compact rails only when relevant and uses shadcn sheets for expanded navigation; switching
contexts closes the mobile context sheet. `SidebarAction` composes ghost Buttons with 16px icons.

Each full-width device row is an independent shadcn Collapsible trigger: clicking selects the
workspace and toggles that device's metadata, with a 200ms height transition (reduced motion skips it).
Compact device icons remain navigation links. Metadata shows the stored URL,
client connection state and last successful check, with Connect/Disconnect/Cancel as appropriate.
The card calls the existing DeviceProvider/ConnectionProvider lifecycle; it adds no new backend API. No
uptime or connected-client metric is available. Device settings remain in backend context navigation.
`useDeviceStatus` keeps rail and Home status labels consistent.

Navigation surfaces use client/context tokens, with content retaining the base background. The
client surface is lightest in dark mode; context is intermediate and content darkest. Column divider
borders and the visible resize line are removed while the expanded resize hit target remains active.
Selected device cards use a shared row/details background without an outline or metadata border.
Disclosure state is not selection: tree/device triggers override the primitive's expanded background.

`ProjectTree` uses nested lists with dashed elbow connectors, including main conversations,
subagents and forks. The final sibling's vertical connector ends at its row center, while parent
branches continue only to siblings that actually exist. Conversation selection uses background
and aria-current. Remaining borders default to dashed strokes; focus rings and form-control focus colors retain their
accessibility styling. These are presentation rules, not new backend domain entities.

The rail lists all saved devices with initials, accessible names and status indicators. Green means
that device is the active connection, amber means connecting, red means the latest attempted device
failed, and gray means not connected in this client. These are not independent fleet health checks: only one backend
connection is supported. Route selection determines the viewed device independently of connection state.

The primary column selects Home, a device or Preferences. The adjacent panel shows either that
device's projects/Device settings or Preferences categories (Appearance and saved bookmarks).
Device settings currently owns connection checks/connect/disconnect; provider/model configuration
is not implemented. Future backend-owned preferences belong in that scope, not browser appearance.

- `/`: cross-device overview of saved devices and the current connection state.
- `/devices/[deviceId]`: selected device workspace.
- `/devices/[deviceId]/settings`: connection actions for that bookmark.
- `/devices/[deviceId]/preview/[conversationId]`: clearly marked frontend examples.
- `/settings`: redirects to `/settings/connections`.
- `/settings/connections`: search/open/forget browser-local bookmarks and Add device.
- `/settings/connections/new`: save a named URL, then open its workspace without connecting.
- `/settings/appearance`: System/Light/Dark theme selection.

The main content pane currently displays route content. A multi-pane workspace for conversations,
files and previews is a future increment; no window/docking framework is installed yet.

`ProjectTree` demonstrates collapsible project → session → conversations, with subagent/fork
examples. It has no backend entities, creation API or execution behavior. These fixtures are a
navigation prototype, not a domain schema or implementation of Durable. Authentication and SSH
are not offered as nonworking controls.

`DeviceProvider` sits inside `ConnectionProvider`, above route content. It persists only device
IDs, display names and normalized loopback URLs in `localStorage` (`console.devices.v1`). Its
`select` operation is called by explicit Connect, not rail navigation. Adding only bookmarks;
forgetting the selected/connected device aborts its connection. Corrupt stored lists are reported
and not overwritten. Cross-tab concurrent editing is not coordinated in this increment.

`components.json` records `base-lyra`, Zinc and Lucide. The shared preset code is `bddBUJXM`;
Geist comes from `next/font`, and the theme radius is overridden to zero. `next-themes` owns
appearance with a system default. Tailwind/PostCSS and `shadcn/tailwind.css` supply styling.
The installed UI source is formatted to repository conventions, with small semantic/lint fixes;
the sidebar's unused cookie write is omitted. No global lint rules are disabled for generated code.
