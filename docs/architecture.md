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
| `packages/web/src/components/workspace/` | Device workspace, connection settings and conversation previews. |
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
There is no Console client authentication. Provider persistence is described below. Future API authentication belongs at the backend request
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
uptime or connected-client metric is available. Machine settings remain in backend context navigation.
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
device's projects/Machine settings or Preferences categories (Appearance and saved bookmarks).
First-column device disclosures own connect/disconnect. Machine settings replaces the project tree
with Providers and Projects settings categories and Back to workspace; it owns AI provider configuration and the default projects folder. Provider
credentials and favorite models belong to that backend, not browser appearance.

- `/`: cross-device overview of saved devices and the current connection state.
- `/devices/[deviceId]`: selected device workspace.
- `/devices/[deviceId]/settings`: redirects to the Providers category.
- `/devices/[deviceId]/settings/providers`: provider sign-in, enable/remove controls, models and favorites.
- `/devices/[deviceId]/preview/[conversationId]`: clearly marked frontend examples.
- `/settings`: redirects to `/settings/connections`.
- `/settings/connections`: search/open/forget browser-local bookmarks and Add device.
- `/settings/connections/new`: save a named URL, then open its workspace without connecting.
- `/settings/appearance`: System/Light/Dark theme selection.

The main content pane currently displays route content. A multi-pane workspace for conversations,
files and previews is a future increment; no window/docking framework is installed yet.

`ProjectTree` lists real backend project registrations. New conversation and Recents still open
frontend examples, without a session or execution backend. The older conversation preview routes
are fixtures, not a domain schema or implementation of Durable. Authentication and SSH
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

## Provider management

`packages/server/src/providers/store.ts` owns `~/.local/share/console/providers.sqlite` (directory
created with mode 0700, file 0600). Credentials are plaintext protected by filesystem permissions,
not encrypted or an OS keychain. SQLite transactions and a mutation queue serialize credential
updates, including Pi-owned token refresh; favorites, enabled state, installation identity and
dynamic catalog cache share this store. `modify` checks cancellation before committing. Reads of
provider metadata never return credential values. Earlier Console databases and Pi auth.json are untouched.

`service.ts` composes Pi AI 1.4.0's `Models`, `CredentialStore` and `ModelsStore`. Built-in factories
own provider login prompts and model catalogs. Console supplies a nonambient auth context: no env
credential lookup or automatic discovery of credential files. Some provider-owned login methods
can explicitly ask for backend-side profiles/paths; this is local, trusted configuration today.

`routes.ts` owns HTTP schema validation, cache prevention and sanitized errors. Sign-in is a
bounded backend operation: POST starts it, GET observes it, POST answers a prompt and DELETE
cancels it. Prompts/events are memory-only, expire after ten minutes, and terminal results remain
for sixty seconds. One active login per provider is allowed. Disconnect/remove cancels and waits
for pending login before changing storage, preventing a late login from restoring removed keys.
A per-provider update guard rejects overlapping login/configuration/catalog mutations while a
provider update is in progress, including a new login arriving during removal.
Backend shutdown aborts pending logins before closing storage. Restart requires restarting a pending
login; completed credentials/favorites persist. There is no durable agent runtime or event SSE yet.

Configured/enabled status means credentials exist and are enabled, not that upstream access was
verified. Pi handles model availability filtering and thinking-level metadata. Explicit catalog
refresh invokes only that provider's refresh implementation; static catalogs are no-ops. Cached
dynamic catalogs are restored by the provider refresh path; a restart may require Refresh catalog
before dynamic-only favorites become available. Disabling retains favorites; removing clears local
configuration/cache. Neither action revokes an upstream OAuth grant. Future execution must enforce
enabled state and use the same filtered favorites boundary; catalog presence alone grants no access.

`packages/web/src/components/providers/` owns backend-scoped metadata, settings
and sign-in dialogs. The connection origin scopes requests and state; switching/disconnecting aborts
obsolete requests. Overview refreshes use a sequence guard; stale responses cannot overwrite newer
mutation results. Login polling runs sequentially; secret input is scoped to the current prompt and
never written to browser storage. The page lists provider methods, searches models and stars favorites;
`GET /v1/models/favorites` is the contract for a future chat picker, not an implemented chat selector.

The implementation follows [Pi Pocket's provider flow](https://github.com/TannerMidd/pi-pocket/blob/db1e531d492f9ce231ba7a9761c52c0ebc7becc0/src/server/providers.ts)
and [Pi AI's provider/auth API](https://github.com/earendil-works/pi/tree/main/packages/ai). Unlike
Pi Pocket, Console owns a separate credential store rather than sharing Pi's auth.json.
A pnpm patch adds missing JSON import attributes to Pi AI's published declaration files, preserving
strict NodeNext checks. The Google SDK's optional MCP type peer is a development dependency;
no MCP capability is exposed. Reviewed Google/protobuf lifecycle scripts are explicitly approved.

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

Workspace navigation separates Projects from Recents (conversations outside projects), with a
New conversation entry. New conversation and Recents open frontend examples only: they create no conversations,
folders or files; expanded project rows toggle sessions and a sibling gear opens settings. The sidebar omits the Preview badge; the content view retains its explicit
preview notice. Recents does not represent a live activity feed or persisted history yet.

The workspace New conversation action aligns vertically with Home in the primary column.
Collapsed workspace navigation exposes direct project/Recents folder shortcuts; only the top
chevron expands the panel. The footer uses the label Machine settings.

## Projects

`packages/server/src/projects/` separates SQLite registration storage, directory validation and HTTP routes.
The registry is `~/.local/share/console/projects.sqlite`; `storage/database.ts` gives both project and
provider databases private permissions and a busy timeout. Project records contain UUID, name, canonical
absolute path and creation time. A unique path constraint arbitrates concurrent registration requests.
Directory checks use realpath/stat/access (read/write/traverse); they are a snapshot, not a filesystem
sandbox or a guarantee that later execution will succeed. No writes occur inside a project directory.

GET `/v1/projects` lists registrations; POST registers `{name,path}`; GET `/v1/projects/:id` opens
metadata; DELETE removes the registration only. List/open recheck availability, retaining unavailable
registrations. Unknown body fields fail validation. PUT `/v1/projects/:id` updates a display name, preset icon and color without changing the path or files. No directory browsing, sessions or execution is exposed. New/clone setup is described below. API access retains the existing local-only boundary.

The frontend's `hooks/use-backend-request.ts` owns bounded, uncached requests and cancellation on
connection change, shared by providers and projects. `components/projects/projects-provider.tsx`
scopes project lists to the active origin and rejects stale refreshes; ten-second polling observes
other clients. `project-page.tsx` owns the empty project workspace and dedicated editor/check/remove views. Expanded and
compact workspace navigation list the same real projects. Routes are
`/devices/[deviceId]/projects/new` and `/devices/[deviceId]/projects/[projectId]`. Opening a bookmark
never connects automatically. The registration form cannot operate against a different selected machine.

## Managed project setup

Machine defaults use `machine_settings` in projects.sqlite, initially resolving the backend home
plus Projects. GET/PUT `/v1/machine/settings` read/save `projectsRoot`; saving a missing path does
not create it. Existing registrations retain their paths. POST `/v1/projects/create` accepts
`{name,folder,createParents}`; POST `/v1/projects/clone` additionally accepts `repository`.

`projects/setup.ts` validates one portable folder segment, checks the captured root, optionally
creates missing parents and rejects registered/existing destinations. Work is prepared inside a
unique hidden staging directory under that root. A nonrecursive mkdir exclusively reserves the
final name before rename publishes the result; a competing request cannot overwrite an existing
folder. Failure removes only staging and an empty reservation. Published files are never recursively
deleted. Registration failure after publication leaves files for Existing directory to recover.
Directory checks are snapshots, not a filesystem security boundary against a hostile local operator.

`projects/git.ts` spawns Git using argument arrays (no shell), with a minimal environment, global
and system configuration disabled, no credential helper/prompts, empty templates, disabled hooks,
HTTPS-only transport, no redirects and no recursive submodules. Git is an external runtime dependency.
New repositories use main and have no initial commit. Clone URLs cannot contain credentials/query/
fragments; private login, SSH and pull/update are deferred. On Linux cancellation kills the Git
process group, including transport children. Windows descendant cancellation has not been verified.

The service caps setup at two concurrent operations, times out after two minutes and aborts pending
operations during close. HTTP disconnect cancels its operation; the client has a slightly longer
request deadline and Cancel setup. This is bounded HTTP work, not a durable job: process crashes can
leave hidden `.console-setup-*` staging directories; no automatic deletion or resume is implemented.

`project-setup.tsx` owns the three-mode shadcn Tabs form, derived names, destination summary and parent
creation checkbox. `project-settings.tsx` owns the machine projects-root form. No browser filesystem
picker is used: these are paths on the connected backend. Public Git behavior follows the official
[clone](https://git-scm.com/docs/git-clone) and [init](https://git-scm.com/docs/git-init) documentation.

Project appearance is backend-owned. SQLite adds icon/color columns transactionally to existing registries, with folder/neutral defaults. Expanded project rows use shadcn Collapsible; their settings link is a separate sibling control. `/devices/[deviceId]/projects/[projectId]/settings` hosts the editor. Polling updates names and appearance across clients without replacing unsaved editor drafts.

## Project Git inspection

GET `/v1/projects/:id/git` resolves the registered project and rechecks its directory. `projects/git-metadata.ts` runs read-only Git commands with argument arrays, isolated global/system configuration, no optional locks, a five-second timeout and 1 MiB output limit per command. Responses distinguish repository, non-repository and unavailable/error states; command stderr is not exposed. Local refs use `for-each-ref`; worktrees use the stable NUL-delimited porcelain format, preserving paths containing newlines. No network operation or history traversal is performed.

`project-git.tsx` owns the on-demand Git view and aborts stale client requests on unmount/origin changes. Refresh rechecks directory and Git metadata; ordinary project polling does not spawn Git processes. Worktree discovery is read-only and does not establish execution isolation. Each inspection consists of multiple commands and is a best-effort snapshot if Git changes concurrently.

The project editor uses full-width responsive layout and top-right removal/confirmation. Its icon picker renders 32 Lucide presets; the project update schema accepts the same IDs. Git inspection behavior remains on demand; reorganizing the view does not add Git actions or polling.

Project identity and directory metadata use container-responsive columns so their layout follows the available content pane. Current Git rows use accessible current-state attributes and blue square markers. The first Git worktree-list record is the main worktree (or bare repository); linked records use their directory basename as display identity. Branch names remain in the API snapshot but are omitted from the compact worktree UI. The red Delete action retains the registration-only backend contract.

The editor tracks the last successfully saved name/icon/color separately from its draft. Its conditional header Save button targets the identity form and hides on revert or successful save. The project-title refresh icon reads directory and Git data; the Git view reports loading to keep that control disabled until completion. Main is the display label for the original checkout; active worktrees and branches share row highlighting.
