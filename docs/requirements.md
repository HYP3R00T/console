# Requirements

The current increment connects a local website to an explicitly selected local backend configures its AI providers, and sets up projects on that machine.

- Fastify listens on `127.0.0.1:3000`; Next.js listens on `127.0.0.1:3001`.
- The website starts disconnected, with a full-width layout and two navigation columns.
- The client column animates between 256px expanded and a 56px rail over 200ms; reduced motion skips the transition. It lists devices, Home, Add device and Client preferences.
- Selecting a device changes the viewed workspace without connecting it automatically.
- The contextual second column is absent on Home; devices show registered projects, conversation previews and Machine settings, while Preferences shows its categories.
- Projects are real backend registrations. Sessions, subagents, forks and standalone conversations remain frontend examples.
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
- Connection state survives page navigation, but reload starts disconnected. Device bookmarks and appearance use browser storage.
- Both apps retain separate startup commands and native terminal output.

Authentication is deliberately deferred. The browser accepts only loopback backend URLs;
the backend permits browser requests only from the local website's two supported origins.
These reachability restrictions are not user authentication: other local processes can call the API.
There is no Console user/token management, agent execution or server-side device connection registry.
Provider credentials and favorites are backend-owned; Console client authentication remains deferred.
SSH, cloud exposure and nonlocal browser hosting require a separate authenticated transport design.
Existing data from earlier experiments remains untouched and unused.

## AI providers

- Machine settings exposes the built-in Pi AI provider catalog, supported API-key and subscription OAuth methods, and search.
- The second column shows registered projects in workspace mode and Providers/Projects categories in machine-settings mode, with Back to workspace. Device names, URLs and provider-count shortcuts are not duplicated there.
- Login prompts, provider URLs/codes, progress, cancellation and errors use HTTP operations. Pending flows expire after ten minutes and do not depend on an open browser tab.
- Disconnect provider disables use while retaining credentials/favorites; reconnect re-enables them. Remove deletes local credentials, favorites and cached catalog, not the upstream account or grant.
- The backend stores API keys/OAuth tokens and favorites in its own private SQLite database; no browser credential persistence, environment configuration or shared Pi sign-in import is used.
- Model overview/search exposes catalog IDs/names, context/output limits, supported inputs, thinking levels and catalog pricing.
- Favorite choices persist per backend. The future picker API returns only starred models that Pi considers available from enabled providers; no favorites means an empty picker list.
- Configured/enabled means stored credentials, not a successful live inference or proof of model entitlement. No billable validation call is made.
- Provider metadata refreshes in connected clients every ten seconds and after mutations. Agent event SSE, chat model pickers and execution are not yet implemented.

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
folders or files. Expanded project rows toggle their sessions; a separate gear opens project settings. The sidebar omits the Preview badge; the content view retains its explicit
preview notice. Recents does not represent a live activity feed or persisted history yet.

The workspace New conversation action aligns vertically with Home in the primary column.
Collapsed workspace navigation exposes direct project/Recents folder shortcuts; only the top
chevron expands the panel. The footer uses the label Machine settings.

## Project registration

- Register an existing readable, writable, traversable directory on the selected backend using a name and absolute path.
- Resolve symlinks to canonical paths and reject duplicate directory registrations, including concurrent requests.
- Persist project IDs, names, paths and creation timestamps on that machine. Browser bookmarks remain client-owned.
- List/open registered projects and recheck directory availability without creating files or running tools.
- Missing/inaccessible directories remain registered with an unavailable status.
- Remove registration only; preserve the directory and every project file. Display names, preset icons and colors are editable; directory paths are immutable. No session or execution APIs yet.

## Project setup and machine defaults

- Machine settings → Projects stores an absolute default projects folder, initially `~/Projects` resolved on the backend. Changing it never moves existing projects.
- Add project offers Existing directory, New project and Clone repository, with a resolved destination summary and editable names/folder names.
- Existing registration accepts directories anywhere and leaves their files/Git untouched. Defaults suggest the configured root plus project name.
- New project creates a fresh folder under the default root and runs Git init on branch main, without an initial commit.
- Clone accepts public HTTPS Git URLs only, without embedded credentials, query strings or fragments. No personal Git/SSH config, credentials, templates, hooks or submodules are used.
- Missing parents are created only with the explicit checkbox. Existing destinations and duplicate registrations fail without overwrite.
- Setup stages work, reserves a destination name exclusively, then publishes it and registers it. Failed/cancelled Git operations remove their staging directory; published files are preserved if registration fails.
- Git must be installed on the backend. Setup allows two concurrent operations, has a two-minute limit, and cancels on client disconnect. No durable job recovery, private authentication, SSH clone or Git pull/update workflow yet.

Project settings persist name, icon and color per backend. Renaming changes the label only. Project disclosures show an honest empty state until sessions exist; metadata/check/remove actions live in a dedicated settings route. Add project uses a 2:1 form/destination layout on wide screens.

## Project Git metadata

- Project settings shows directory availability as an accessible square status marker beside the Directory label, with one refresh action.
- Read-only Git metadata includes current branch, local branch names/count, main/linked worktree identification, and registered worktree paths/branches/count. Bare repositories, detached HEAD and unborn branches have explicit states.
- Metadata is loaded on opening project settings and on explicit refresh, not on every project-list poll. No history, remote fetch, branch switching, worktree creation or Git mutation is included.

Project settings uses the full content width. Removal/confirmation lives at the top-right; name/icon editing and directory metadata share two responsive columns with a single inset input focus outline. The icon picker offers 32 searchable Lucide presets. Git has separate branches/worktrees sections with blue current-item squares, aligned counts and one on-demand refresh button. Worktree identity and checked-out branch are distinct.

Project headers show only the project name and destructive Delete/trash action. Deletion remains registration-only and requires confirmation. UI omits redundant Git/Main worktree and current-branch summary lines; the worktree list uses Main as the original checkout display label and omits per-worktree branch lines.

Save changes is shown immediately left of Delete only for unsaved name/icon/color changes; reverting changes hides it. Refresh is an icon beside the project title and waits for directory/Git reads to finish. Current worktrees and branches share shaded row backgrounds and blue square markers.
