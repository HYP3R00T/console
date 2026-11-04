# Requirements

The current increment connects a local website to an explicitly selected local backend, configures
its AI providers, sets up projects, and runs conversations with read-only project inspection through project-owned Durable sessions.

- Fastify listens on `127.0.0.1:3000`; Next.js listens on `127.0.0.1:3001`.
- On first use the website starts disconnected, with a full-width layout and two navigation columns.
- The client column animates between 256px expanded and a 56px rail over 200ms; reduced motion skips the transition. It lists devices, Home, Add device and Client preferences.
- Selecting a device changes the viewed workspace without connecting it automatically.
- The contextual second column is absent on Home; devices show registered projects, standalone conversations and Machine settings, while Preferences shows its categories.
- Projects, sessions and project conversations are real backend records; each session opens one internal Durable Harness. Forks and subagents are deferred.
- The first column chooses Home, a device or Preferences. Appearance and saved-device category navigation lives in the second column; device disclosures in the first column own backend connection actions.
- `/settings/connections/new` saves a backend name and loopback URL, then opens its workspace.
- Device names and URLs persist only in this browser; saving a device does not connect it.
- The shadcn Base UI Lyra/Zinc preset uses Geist, Lucide icons and zero corner radii.
- Column separation uses surface tones rather than divider borders: the dark theme runs from lightest client navigation to intermediate context to darkest content, with matching light-theme surfaces.
- Device selection shades the whole card without an outline; expansion alone does not change row backgrounds. Tree branches and remaining borders default to dashed strokes, with tree connectors ending at the final row.
- Appearance supports system, light and dark; mobile context navigation uses a sheet.
- Context visibility animates its occupied width to/from zero over 200ms without translating content; reduced-motion preferences disable the animation.
- The desktop context panel resizes between 208–384px, collapses to a 56px icon rail and restores its last expanded width. Each newly entered device/Preferences context starts collapsed.
- Chevron toggles stay anchored at the same top-left position. Toggling the first column preserves the second column's open/collapsed state.
- Each expanded device row independently toggles its metadata vertically using shadcn Collapsible and selects that device. The row and details form one borderless shaded card. Details include URL, connection state, last successful check and explicit Connect/Disconnect/Cancel actions.
- The compact context rail has no active resize hit area or keyboard resize control. Resize is available only after explicit expansion, constrained to 208–384px; collapsing uses the toggle.
- Home provides a cross-device overview using saved bookmarks and the current client connection state.
- Uptime, connected-client counts, file viewers and split conversations are not implemented.
- Each preferences page owns its content pane. No device-selector popup is used.
- The content pane has no navigation toolbar; it is reserved for route content and future workspace views.
- Connect checks the backend's connection response before showing Connected.
- Connected browsers recheck every five seconds. A failed check clears the connection and shows an error.
- Disconnect and Cancel abort pending checks without stopping or modifying the backend.
- Reload rechecks the last explicitly connected device. Disconnect, Cancel and Forget clear that choice. Device bookmarks and appearance use browser storage.
- Both apps retain separate startup commands and native terminal output.

Authentication is deliberately deferred. The browser accepts only loopback backend URLs;
the backend permits browser requests only from the local website's two supported origins.
These reachability restrictions are not user authentication: other local processes can call the API.
There is no Console user/token management or server-side device connection registry. Project sessions support text responses and read-only inspection tools.
Provider credentials and favorites are backend-owned; Console client authentication remains deferred.
Connectivity must be an extension boundary. Feature components use a connected backend client
for both commands and subscriptions. Replacement/disconnect cancels that client's requests and
streams. The server applies connection policy before feature handlers. Future remote endpoints,
authentication and tunnels belong at this boundary; the current implementation supplies local HTTP.
Existing data from earlier experiments remains untouched and unused.

## AI providers

- Machine settings exposes the built-in Pi AI provider catalog, supported API-key and subscription OAuth methods, and search.
- The second column shows registered projects in workspace mode and Providers/Projects categories in machine-settings mode, with Back to workspace. Device names, URLs and provider-count shortcuts are not duplicated there.
- Login prompts, provider URLs/codes, progress, cancellation and errors use HTTP operations. Pending flows expire after ten minutes and do not depend on an open browser tab.
- Disconnect provider disables use while retaining credentials/favorites; reconnect re-enables them. Remove deletes local credentials, favorites and cached catalog, not the upstream account or grant.
- The backend stores API keys/OAuth tokens and favorites in its own private SQLite database; no browser credential persistence, environment configuration or shared Pi sign-in import is used.
- Model overview/search exposes catalog IDs/names, context/output limits, supported inputs, thinking levels and catalog pricing.
- Favorite choices persist per backend. The composer model-picker API returns only starred models that Pi considers available from enabled providers; no favorites means an empty picker list.
- Configured/enabled means stored credentials, not a successful live inference or proof of model entitlement. No billable validation call is made.
- Provider metadata refreshes in connected clients every ten seconds and after mutations. Session SSE and composer model/thinking selection are implemented; read-only project tools and their activity are available; richer agent events remain deferred.

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

## Project registration

- Register an existing readable, writable, traversable directory on the selected backend using a name and absolute path.
- Resolve symlinks to canonical paths and reject duplicate directory registrations, including concurrent requests.
- Persist project IDs, names, paths and creation timestamps on that machine. Browser bookmarks remain client-owned.
- List/open registered projects and recheck directory availability without creating files or running tools.
- Missing/inaccessible directories remain registered with an unavailable status.
- Archive the project registration and its conversations while preserving the directory and every project file. Display names, preset icons and colors are editable; directory paths are immutable. Harness/session APIs and text generation are described below.

## Project setup and machine defaults

- Machine settings → Projects stores an absolute default projects folder, initially `~/Projects` resolved on the backend. Changing it never moves existing projects.
- Add project offers Existing directory, New project and Clone repository, with a resolved destination summary and editable names/folder names.
- Existing registration accepts directories anywhere and leaves their files/Git untouched. Defaults suggest the configured root plus project name.
- New project creates a fresh folder under the default root and runs Git init on branch main, without an initial commit.
- Clone accepts public HTTPS Git URLs only, without embedded credentials, query strings or fragments. No personal Git/SSH config, credentials, templates, hooks or submodules are used.
- Missing parents are created only with the explicit checkbox. Existing destinations and duplicate registrations fail without overwrite.
- Setup stages work, reserves a destination name exclusively, then publishes it and registers it. Failed/cancelled Git operations remove their staging directory; published files are preserved if registration fails.
- Git must be installed on the backend. Setup allows two concurrent operations, has a two-minute limit, and cancels on client disconnect. No durable job recovery, private authentication, SSH clone or Git pull/update workflow yet.

Project settings persist name, icon and color per backend. Renaming changes the label only. Project disclosures show real sessions and conversations; Edit opens a dedicated settings route; a project context menu also offers Remove and Pin/Unpin. Add project uses a 2:1 form/destination layout on wide screens.

## Project Git metadata

- Project settings shows directory availability as an accessible square status marker beside the Directory label, with one refresh action.
- Read-only Git metadata includes current branch, local branch names/count, main/linked worktree identification, and registered worktree paths/branches/count. Bare repositories, detached HEAD and unborn branches have explicit states.
- Metadata is loaded on opening project settings and on explicit refresh, not on every project-list poll. No history, remote fetch, branch switching, worktree creation or Git mutation is included.

Project settings uses the full content width. Removal/confirmation lives at the top-right; name/icon editing and directory metadata share two responsive columns with a single inset input focus outline. The icon picker offers 32 searchable Lucide presets. Git has separate branches/worktrees sections with blue current-item squares, aligned counts and one on-demand refresh button. Worktree identity and checked-out branch are distinct.

Project headers show only the project name and Archive action with confirmation. UI omits redundant Git/Main worktree and current-branch summary lines; the worktree list uses Main as the original checkout display label and omits per-worktree branch lines.

Save changes is shown immediately left of Remove only for unsaved name/icon/color changes; reverting changes hides it. Refresh is an icon beside the project title and waits for directory/Git reads to finish. Current worktrees and branches share shaded row backgrounds and blue square markers.

## Project actions and pinning

- Right-click project entries in expanded or compact navigation for Edit, Pin to top/Unpin and Archive. Project clicks still expand/collapse rather than opening settings; the gear shortcut is removed. Keyboard context-menu invocation and library long-press behavior expose the same actions.
- Pinning is a client preference persisted in this browser per backend URL. Newest pins sort first; unpinned projects keep backend order. Removed/unknown IDs do not create sidebar entries. No cross-tab synchronization is implemented.
- Sidebar and settings Archive share a confirmation dialog that names the project and path. Restore is available under Machine settings → Projects → Archive.

## Durable project increment

- Machine → project → numbered sessions → conversations. Each session has one internal Durable Harness; UI/API do not duplicate that level.
- Project registration creates Session 1/Main automatically; missing defaults are backfilled on startup. Additional sessions are numbered, and additional conversations use automatic names.
- Console owns the harness/session index; Durable owns conversation state, transcripts, queued inputs and task checkpoints.
- New sessions/conversations need no name/model prompt. Sending requires an enabled available favorite model and a supported thinking level; choices belong in the composer.
- HTTP message admission requires a client-generated UUID request ID; retries reuse it without duplicate generation.
- SSE observation reconnects with current committed state. Closing the browser does not stop admitted work.
- Backend startup reopens and resumes sessions for available projects. The session-wide Stop API withdraws queued input and aborts ordinary work; no chat Stop session control is shown.
- Text history survives graceful/abrupt restarts; automatic recovery follows Durable retry rules, not exactly-once provider billing.
- Archive requires idle sessions. If work is running or queued, warn and offer Stop all and archive. Stop must complete before archiving. Restore recovers the same project, sessions and conversations without restarting interrupted work. Project triggers are planned and must remain disabled after restore.
- Read-only project listing, file reads and literal text search use a shared execution interface. No write/process tools, OS sandbox, or fork/subagent APIs.
- Harness creation itself is not idempotent on request retry. Session lists report the first 200 conversations; SSE and history are bounded network projections.

Project context menus own New session. Session context menus and plus own New conversation.
The first session is Session 1 (default); numbers are allocated atomically. Existing session UUIDs
and transcripts survive numbering migration. No separate harness entry or New harness button is
shown. The composer uses an icon-only square arrow, model selection followed by model-specific
thinking levels, and no inactive attachment/slash-command affordances. The header has no Live badge.
Jump to latest is conditional on being scrolled away from the bottom; short conversations omit it.
