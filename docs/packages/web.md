# Web app

`packages/web` is the private `@console/web` workspace package. It uses Next.js App Router,
React, TypeScript, Tailwind CSS v4, and shadcn/ui. Chat has a collapsible Machines tree, a dedicated
conversation with a bottom composer, and on-demand agent controls. Settings is a separate page. Provider settings belong to the machine. `/machines` shows its identity, session counts, and actual database locations.

## Run and verify

From the repository root, run `mise install`, then `pnpm install --frozen-lockfile`.

- `mise run dev` or `pnpm dev`: start both apps natively in parallel. Stop them with Ctrl+C.
- `mise run dev:server`: start only Fastify at `http://127.0.0.1:3000`.
- `mise run dev:web`: start only Next.js at `http://127.0.0.1:3001`.
- `pnpm --filter @console/web typecheck`: generate Next.js route types and check TypeScript.
- `pnpm --filter @console/web build`: create the web production build.
- `pnpm --filter @console/web start`: serve that build on loopback port 3001.

The web app starts without a selected execution machine. Its own `/api/machines` route stores
explicit connections; `/api/machines/:id/api/*` proxies only that saved machine's API. A local
Fastify server is not required to load onboarding or manage the registry. `CONSOLE_API_URL` and
the implicit `/api/v1/*` proxy are retired; old implicit requests return 410.

Open Connect a machine from Home (or Add machine in the network), enter the server origin (for example `http://127.0.0.1:3000`) and its token
if configured, then Connect. Labels are optional; the authenticated handshake supplies a default
machine name and verifies Console API v1. Remote connections require a token and HTTPS or a
loopback SSH tunnel. The server startup log prints its connection URL and authentication mode.
Disconnect clears the token and closes managed SSH while retaining recent connection metadata.
Reconnect immediately attempts the saved connection and selects the machine on success. If an
access token is required, an inline prompt retries that same connection with the supplied token.
Forgetting removes only that recent metadata.
Check local server probes loopback port 3000 only on demand; it does not connect automatically.
SSH uses the web host’s existing keys, agent, and trusted hosts; the remote backend must already run.

Connections and tokens are persisted by the web server in owner-only
`$XDG_DATA_HOME/console-web/connections.sqlite` (default `~/.local/share/console-web/connections.sqlite`).
Provider credentials and conversation databases stay on their execution machine. The web server
never returns connection tokens to the browser. Saved selections are per-tab; an invalid or
removed selection leads back to onboarding, without falling back to another machine.

`/health` confirms HTTP liveness only. The dashboard polls session endpoints and marks disconnected history as potentially stale; successful configuration does not prove model access or user authentication.

## Structure and boundaries

- `src/app/layout.tsx`: shared document structure and metadata.
- `src/app/page.tsx`: Home overview with actual machine counts and selected-machine summaries.
- `src/app/chat/page.tsx`: session selection, polling, drafts, submission identities, and resizable navigation.
- `src/components/network-sidebar.tsx`: collapsible machines/projects/conversations, context menus, inline rename/Trash confirmation, creation, and remote selection.
- `src/components/agent-panels.tsx`: live State, Tasks, Tools, and Extend inspectors.
- `src/components/chat-composer.tsx`: expanding text input, model/configuration shortcut, Send, and Stop.
- `src/components/session-chat.tsx`: transcript, composer, and cancel/resume controls.
- `src/components/message-reasoning.tsx`: provider-visible thinking in shadcn Trace rows; opens while thinking and closes afterward unless manually toggled.
- `src/components/session-inspector.tsx`: per-agent model, thinking, and sandbox controls in the contextual panel.
- `src/components/sandbox-settings.tsx`: explicit opt-in workspace, read/write directories, and network policy.
- `src/app/settings/page.tsx`: full-page model preferences, machine defaults, and provider configuration.
- `src/app/machines/page.tsx`: machine inventory, storage paths, editable name/project directory, and model defaults.
- `src/components/choice-select.tsx`: shared shadcn Select controls for model, provider, thinking, and network choices.
- `src/components/provider-connection.tsx`: generic Pi prompts, OAuth links, device codes, and cancellation.
- `src/lib/console-api.ts`: browser API calls and view types; no provider SDKs or persisted secrets.
- `src/app/globals.css`: Tailwind imports and shadcn theme tokens.
- `src/components/ui/`: shadcn components, starting with the preset's Button.
- `src/components/theme-provider.tsx`: system light/dark mode through `next-themes`.
- `components.json`: shadcn component paths and style configuration.
- `src/lib/machine-store.ts`: independent connection registry, compatibility handshake, and bounded authenticated proxy.
- `src/app/api/machines/[[...path]]/route.ts`: same-origin connection/proxy routes.
- `next.config.ts`: Next.js configuration; no default backend rewrite.

Keep server-owned execution, workspace access, and permissions in Fastify. Next.js can
provide routing, layouts, and future login UI, but that does not replace backend authorization.
Authentication, shared sessions, and team access have not been implemented.

## Styling and components

Preset `bddBUJXM` selects Lyra styling, zinc colors, Geist, and Lucide icons. Geist is
self-hosted by Next.js after its build-time download. Tailwind runs through
`postcss.config.mjs`; Biome's CSS parser supports Tailwind directives.

Biome checks legacy Tailwind utility names in JSX and class helpers such as `cn()`
and `cva()`, using `src/app/globals.css` for the theme. Run `pnpm check` to report
them and `pnpm check:fix` to apply safe replacements, including `break-words` to
`wrap-break-word`. The same rule runs through the existing prek hook and CI.
This catches legacy utility names; it does not reproduce every Tailwind IntelliSense suggestion.

Run shadcn commands from `packages/web`. Use `pnpm dlx shadcn@latest add <component>`
to add a component. The applied theme can be restored with
`pnpm dlx shadcn@latest apply --preset bddBUJXM`. Review generated changes and run
the repository checks afterward. The `@/*` alias maps to `src/*`.

`next-env.d.ts`, `.next/`, and TypeScript build caches are generated and ignored. Next.js
generates its declarations when running `dev`, `build`, or the `typegen` step in `typecheck`.
Automatic Next.js agent-rule generation is disabled; repository instructions remain in root `AGENTS.md`.

Reasoning uses Pi's exposed thinking blocks in live snapshots and saved history. Redacted blocks
and provider signatures stay server-side. Models that expose no reasoning show no Trace row;
elapsed thinking time is not measured or displayed. Manual open/close state lasts while a row
is mounted; reloaded history starts collapsed.

The layout takes structural inspiration from [Durable Pi](https://github.com/disler/durable-pi)
and its [interface walkthrough](https://www.youtube.com/watch?v=DNDYYHsypZg), while retaining
Console's shadcn theme and square Lyra controls. The header links to Home, Chat, and Settings; the left tree navigates machines, projects, sessions, and conversations. Agent configuration opens on demand. Conversation provider pickers show only connected providers; the connection-management page still offers other providers through search. On narrow screens the resizable panels stack vertically. Breadcrumbs show the local machine, saved workspace when present, and session.
The composer sends with Enter and inserts a newline with Shift+Enter; IME composition does not
submit. Text paste works normally. Image/file attachments, transcription, and measured token/cost dashboards are not implemented.

## Try the integration

Run `mise run dev`, open `http://127.0.0.1:3001`, and follow **Provider settings**. Select OpenAI and **Sign in with ChatGPT** for the subscription flow; API key is a separate explicit choice. Other provider methods come from the installed Pi version. Authorization opens the provider's page; any requested code, selection, or credential is relayed to Pi through Fastify. Console itself has no account sign-in yet.

Return to the dashboard and create or select a named session. Choose a provider, model, and supported thinking level in the inspector, then save settings before sending a message. Unfinished work must complete or be cancelled before settings can change. Session selection is retained in the URL; unsent drafts and uncertain submissions stay separate per session while the page is open. Partial text and state are polled once per second. Network failure is shown separately from saved run status. An uncertain submission retains its request ID for retry while the page is open; reloading retrieves existing work without resubmitting. After backend restart, use Resume for interrupted work or Cancel to abandon it. New project conversations enable project-confined coding tools and commands with network blocked. Expand **Sandbox** in the conversation inspector to narrow or disable access, or explicitly allow network access. Existing policies are preserved until changed.

Provider status means configuration exists, not that credentials or subscription entitlement have been tested. Environment-only providers require machine setup; Refresh models retrieves supported dynamic catalogs. The initial UI does not edit custom provider definitions or machine environment variables.

## Configure a sandbox

Open **Sandbox** in the session inspector. Select an existing absolute workspace and enable sandboxed tools. The workspace is readable by default; leave writable directories empty for read-only use and keep network blocked unless needed. Additional directory grants use one absolute path per line. Save explicitly while the session is idle. Unsaved sandbox changes block Send, just like unsaved model settings.

Enabled policies can also be saved again without editing paths, to refresh their tool selection
after an upgrade. Existing sessions need this reapplication to select newly added tools.
With writable grants, `create_directory` and `write_file` can build nested project structure;
`list_directory` inspects readable directories. Enable **Shell commands** explicitly for dependency installation and checks. Commands use a
disposable home, bounded output/time, and the saved filesystem/network policy. Existing sessions
need their sandbox policy saved again to select newly available tools.

Unrestricted network permits HTTP GET, including local services. Provider credentials are never forwarded to the worker. Startup prerequisites remain readable, and Console's private storage and runtime protection cannot be removed through the editor. Saving checks native activation; an unavailable nono/kernel leaves the previous policy unchanged. Tool output is shown in the transcript.

## Shared shell and hierarchy

`ConsoleShell` wraps every page with the same header, backend selector, and navigation. Backend
selection is stored per browser tab in sessionStorage and remounts page state when switching, keeping requests scoped to
the selected connection. Unsent drafts belong to the mounted page and are not preserved across
backend switches. The web-owned connection route injects the selected machine's saved token; the browser
never forwards remote tokens itself after registration.

Machines adds, checks, switches, or disconnects connection records. Editable settings persist on
the selected machine; remote connection aliases track saved machine names. Projects registers
directories or clones public GitHub repositories, with failure/retry status. New session can select
a project; existing unassigned sessions remain available. The left tree includes empty registered
projects and a New session action. The conversation selector opens a session's separate Pi
conversations. Manage session & conversations creates and renames them; Configuration edits the
selected conversation's model and sandbox. New conversations inherit Main's saved settings.

Home is an overview; Conversations (`/chat`) is the work surface. The conversation sidebar
always offers a machine list with Configure and Add actions. Its shadcn Resizable handle supports
pointer and keyboard resizing. Machine/provider/model controls reuse shadcn Select.

The API accepts None, Read, Edit, Project, and Setup access presets. Direct UI creation uses Project
(read/write project files and commands, network blocked). Setup enables project
writes, commands, and unrestricted network; it is never selected by default. New sessions
remember project and machine model preferences. Provider pickers show connected providers only.
Manage session/conversations and Projects expose Trash/Restore actions; project files and databases
are preserved. The final active conversation is deleted through its session.

Provider discovery and session polling retry after disconnection. Background connectivity errors
clear after recovery without erasing action failures. Custom hook editors, example durable-job workflows, attachments,
and automatic private-repository authentication remain later work.

The machine tree has a resizable width and a remembered collapsed rail. Agent controls open in a
nonmodal right-side panel; closing it preserves mounted drafts. Nodes use shadcn Base UI Collapsible; right-click opens creation, rename, settings,
and Trash actions. A trailing ellipsis provides the same menu for keyboard and touch users. Forks and delegated children nest beneath their parent. Remote selection
navigates to its machine/session/conversation address; unsent drafts do not transfer across machines.

The chat header links to machine/project configuration and opens the selected agent's inspector.
New agents require no name prompt; rename them in the tree. Fork from here uses a stored history
entry, not a copied text prompt. Type `/` for keyboard-selectable UI commands: config, state, tasks,
tools, extend, new, new-session, stop, and resume. These commands do not invoke inference themselves.

State edits retain their base revision; background polling never overwrites a draft. A stale save
requires Reload before editing again. Tool switches are limited to installed tools permitted by saved sandbox grants. Extension switches
select real Pi extensions and their sections/hooks; they cannot broaden sandbox authority. Existing conversations remain unchanged
until the user selects tools or reapplies their sandbox. No paid/live inference is used in UI checks.

The machine toggle changes its icon without a persistent selected background. Tree action menus
appear on hover/focus in their own reserved flex space; trailing metadata yields to the menu button. Rename replaces the label with an input;
Enter/blur saves and Escape cancels.
`composer-model-picker.tsx` uses shadcn Popover next to the input. It searches connected models,
shows current selection, and saves supported model/thinking changes immediately without opening
the inspector. The permissions link still opens the full workspace editor.

Trash offers Delete forever followed by a named confirmation. UI verification must not confirm
permanent deletion of personal data; erasure tests use temporary fixtures. Main/delegated entries
explain that their owning session must be deleted. Tool setup remains explicit: state/delegation
can be enabled without granting files; the workspace editor is expanded when its policy is off.

## UI responsibilities

`console-shell.tsx` owns the icon-only Home, Chat, and Settings navigation. Settings is a real
`/settings` page with Model choices, Machine defaults, and Providers sections. Its machine selector
scopes provider credentials and defaults; model menu preferences belong to the web server.
`provider-settings.tsx` contains provider UI; `/settings/providers` remains a compatible entry point.
Machine gears open Settings for that machine. Every machine exposes Add project, including when
it already has projects; this opens the existing repository-clone/directory-registration page.

Chat reserves permanent space only for the machine tree and conversation. The breadcrumb's
Agent controls icon, composer permissions action, and slash commands open the contextual right
panel with Session, State, Tasks, Tools, and Extend tabs. These controls affect the selected agent,
not global defaults. Project gears also open scoped project controls there. Close or Escape dismisses
the panel and returns focus to its trigger; unsaved controls remain mounted while it is hidden.
There is no second collapsed inspector rail, extra toggle, or duplicate conversation toolbar.

`backend-connections.tsx` manages connections and recent machines on `/machines`, outside Settings.
`machine-store.ts` owns private registry persistence, protocol validation, preferences, and proxying;
`ssh-tunnel.ts` owns only the OpenSSH process and endpoint. Connection tokens never enter responses.
Connection setup, connected machines, and recent machines use separate shadcn Cards. Reconnect
attempts the saved connection immediately and prompts inline only when a token is required.
The server supplies the machine name. Chat navigation requires a selected connection.

Home machine cards open their workspace when clicked. A small red icon disconnects independently,
preserving machine data and execution. Tree menu buttons reserve a square trailing slot and appear on hover/focus,
replacing machine metadata and conversation IDs without overlaying text. Right-click offers the
same actions. Moving an item to Trash reveals inline confirm/cancel buttons before deletion. Internal session containers are hidden; conversations use a single message icon. Create, rename, delete, and confirmation controls are 24px squares. Borders remain one pixel.

Only the machine tree remains resizable. Dragging stops at the expanded minimum; its toggle
collapses to a 40px rail containing machine shortcuts. The tab's `sessionStorage` remembers that
choice across routes, machine changes, and reloads. Viewport changes do not override it. Panel
backgrounds match the page. Native scrolling remains enabled without scrollbar chrome or resize pills.

## Conversation history

Opening a conversation shows its latest page at the bottom. Snapshots contain at most 50 Pi
entries. Scrolling upward near the top requests the preceding page; Load earlier messages is a
keyboard-accessible fallback. Older pages merge by stable message ID with live snapshots, without
duplicates or losing pages during polling. Prepending preserves the visible message's position.
New output follows the bottom only while already there; scrolling upward stops that following.
Reasoning/content resizing follows the same rule. Switching conversations aborts pending history
requests and starts a fresh latest-page view. Errors leave existing history available for retry.

## Project navigation and creation

The tree shows machine → Projects → project → conversation. Default collects conversations
without an explicitly selected project; it is a real backend registration, not a synthetic folder.
The initial Main conversation uses its session name until renamed. Session containers stay internal;
additional roots appear beside the initial conversation and forks/subagents nest beneath their parent.
Deleting the last remaining conversation uses session deletion so the backend lifecycle stays valid.

The Projects heading has a square hover/focus plus button. `project-dialog.tsx` uses the shadcn
Base UI Dialog and shared Select/Button components for a name and an existing machine-local folder,
a new folder, or a public GitHub clone. Requests target that machine explicitly and preserve their
idempotency key when retried unchanged. Clone state remains visible through project controls.
Hover changes opacity and row background without resizing action buttons or shifting labels.

## Direct conversation creation

Each project row has a square plus button visible on hover/focus and on touch devices. It creates
and opens a numbered conversation immediately, expands its project, and focuses the composer.
The menu action, empty-state button, and existing `new-session` command use the same creation path.
Creation stays scoped to the chosen machine/project, preserves request IDs across unchanged retries,
and blocks duplicate clicks while pending. There is no project/access selection modal. New contexts
start with the Project sandbox preset: project reads/writes and commands, with network blocked.
Permissions remain editable inside the conversation. If nono cannot enforce the policy, creation
fails visibly; there is no unconfined execution fallback.

Project settings show only project controls. Conversation, State, Tasks, Tools, and Extend tabs
appear only in the conversation inspector. Tools lists both Console compatibility tools and native
Pi `read`, `write`, `edit`, and `bash`; all execute under the same saved sandbox grants.

## Ongoing work and context controls

The composer supports Steer current work, Queue follow-up, and Only when idle. Enter uses the
selected mode; Alt+Enter selects a follow-up and Shift+Enter inserts a newline. Accepted messages
appear in the persisted queue until Pi places them; Withdraw removes a still-queued input.
An uncertain request keeps both its request ID and delivery mode for retry. Interrupted work
requires Resume or Cancel before new input can be admitted.

Conversation controls show estimated context consumption, recorded per-model token/cache usage,
and provider/catalog cost estimates. These are not account billing totals. Compact context accepts
optional instructions; Reset context accepts an optional handoff and retains stored history. Both
are idle-only and preserve request identity on retry. Active compactions and a safe failure status
are shown. Automatic compaction still uses Pi's defaults; threshold editing remains future work.

The transcript includes expandable tool-call arguments, available live tool status/output, and
labels for saved compaction summaries and handoff entries. Tasks also exposes session-wide ownership,
wait dependencies, sleep deadlines, cancellation and blocked reasons. Transport remains polling;
worker output is not a continuous byte stream. See [Pi capability delivery](../pi-capabilities.md).

Project resources in Conversation controls lists loaded instruction sources and indexed skills/templates.
Use skill/template fills the composer without sending. Add the request or template arguments and
send explicitly. Reload resources refreshes the index; instructions are also refreshed on model requests.
The supported commands are `/skill:name request` and `/prompt:name arguments`, with positional
parameters and quoted arguments. Instructions stay inside the approved workspace. Exact Pi CLI
configuration/plugin compatibility is not promised. An older connected server shows unavailable
runtime controls and retains legacy text submission until the operator restarts the updated backend.
