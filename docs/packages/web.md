# Web app

`packages/web` is the private `@console/web` workspace package. It uses Next.js App Router,
React, TypeScript, Tailwind CSS v4, and shadcn/ui. The dashboard has a top action bar,
a collapsible left panel for sessions/configuration, and a dedicated conversation with
a bottom composer. Provider settings belong to the machine. `/machines` shows its identity, session counts, and actual database locations.

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
- `src/components/network-sidebar.tsx`: collapsible machines/projects/sessions/agents, inline rename/Trash, creation, and remote selection.
- `src/components/agent-panels.tsx`: live State, Tasks, Tools, and Extend inspectors.
- `src/components/new-session-dialog.tsx`: top-bar session creation with request IDs preserved across retries.
- `src/components/chat-composer.tsx`: expanding text input, model/configuration shortcut, Send, and Stop.
- `src/components/session-chat.tsx`: transcript, composer, and cancel/resume controls.
- `src/components/message-reasoning.tsx`: provider-visible thinking in shadcn Trace rows; opens while thinking and closes afterward unless manually toggled.
- `src/components/session-inspector.tsx`: left-panel provider, model, and supported thinking-level controls.
- `src/components/sandbox-settings.tsx`: explicit opt-in workspace, read/write directories, and network policy.
- `src/app/settings/providers/page.tsx`: connected-provider cards, searchable connection setup, and model-catalog refresh.
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
Console's shadcn theme and square Lyra controls. The top bar creates sessions; the left panel switches between
workspace-grouped session navigation and configuration without discarding drafts. Conversation provider pickers show only connected providers; the connection-management page still offers other providers through search. On narrow screens the resizable panels stack vertically. Breadcrumbs show the local machine, saved workspace when present, and session.
The composer sends with Enter and inserts a newline with Shift+Enter; IME composition does not
submit. Text paste works normally. Image/file attachments, transcription, and measured token/cost dashboards are not implemented.

## Try the integration

Run `mise run dev`, open `http://127.0.0.1:3001`, and follow **Provider settings**. Select OpenAI and **Sign in with ChatGPT** for the subscription flow; API key is a separate explicit choice. Other provider methods come from the installed Pi version. Authorization opens the provider's page; any requested code, selection, or credential is relayed to Pi through Fastify. Console itself has no account sign-in yet.

Return to the dashboard and create or select a named session. Choose a provider, model, and supported thinking level in the inspector, then save settings before sending a message. Unfinished work must complete or be cancelled before settings can change. Session selection is retained in the URL; unsent drafts and uncertain submissions stay separate per session while the page is open. Partial text and state are polled once per second. Network failure is shown separately from saved run status. An uncertain submission retains its request ID for retry while the page is open; reloading retrieves existing work without resubmitting. After backend restart, use Resume for interrupted work or Cancel to abandon it. Tools are disabled by default. Expand **Sandbox** in the inspector to opt into workspace access; shell commands require an explicit opt-in.

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

New session offers explicit None, Read, Edit, and Setup access presets. Setup enables project
writes, commands, and unrestricted network; it is never selected by default. New sessions
remember project and machine model preferences. Provider pickers show connected providers only.
Manage session/conversations and Projects expose Trash/Restore actions; project files and databases
are preserved. The final active conversation is deleted through its session.

Provider discovery and session polling retry after disconnection. Background connectivity errors
clear after recovery without erasing action failures. Custom hook editors, example durable-job workflows, attachments,
and automatic private-repository authentication remain later work.

The network and inspector collapse independently without discarding their mounted drafts. Both
retain resize handles. Nodes use shadcn Base UI Collapsible; focus/hover exposes rename, creation,
and Trash actions. Forks and delegated children nest beneath their parent. Remote selection
navigates to its machine/session/conversation address; unsent drafts do not transfer across machines.

The chat header links to machine/project configuration and opens the selected agent's inspector.
New agents require no name prompt; rename them in the tree. Fork from here uses a stored history
entry, not a copied text prompt. Type `/` for keyboard-selectable UI commands: config, state, tasks,
tools, extend, new, new-session, stop, and resume. These commands do not invoke inference themselves.

State edits retain their base revision; background polling never overwrites a draft. A stale save
requires Reload before editing again. Tool switches are limited to installed tools permitted by saved sandbox grants. Extension switches
select real Pi extensions and their sections/hooks; they cannot broaden sandbox authority. Existing conversations remain unchanged
until the user selects tools or reapplies their sandbox. No paid/live inference is used in UI checks.

Each column now owns its collapse/expand toggle; there is no extra status bar. Collapsed rails
retain an expansion button with a different icon. Network actions reserve their width on hover
and focus. Rename replaces the label with an input; Enter/blur saves, Escape cancels.
`composer-model-picker.tsx` uses shadcn Popover next to the input. It searches connected models,
shows current selection, and saves supported model/thinking changes immediately without opening
the inspector. The permissions link still opens the full workspace editor.

Trash offers Delete forever followed by a named confirmation. UI verification must not confirm
permanent deletion of personal data; erasure tests use temporary fixtures. Main/delegated entries
explain that their owning session must be deleted. Tool setup remains explicit: state/delegation
can be enabled without granting files; the workspace editor is expanded when its policy is off.

## UI responsibilities

The header navigation and Settings window live in `console-shell.tsx` and `settings-window.tsx`.
`backend-connections.tsx` manages explicit connections/recent entries. `machine-store.ts` owns
private registry persistence, protocol validation, preferences, and proxying; `ssh-tunnel.ts`
owns only the OpenSSH process and forwarded endpoint. Connection tokens never enter UI responses.
`model-preferences.tsx` curates chat/inspector choices across machines without changing backend
model support. Machine and project gears show contextual inspectors. Provider credentials remain
machine-scoped. `confirm-delete.tsx` supplies fixed-width confirmation controls for trash/purge.

Machine connection management lives in the main `/machines` page, independently of Settings.
Home’s Connect a machine and the network’s Add machine both open that page. The header holds
icon-only Home, Chat, and Settings controls with accessible labels/tooltips; machine switching stays in the network/connection list, and session
creation stays within the workspace. There is no permanent application rail.

Connection management uses shadcn Cards to separate connected machines, the connection form,
and recent machines. Row actions share a right-aligned group. The form uses a labeled connection
method selector and takes the machine name from the server; there is no separate optional name
field. Chat navigation appears only after selecting a connected machine.

Home machine cards open their workspace when clicked. A separate small red trash icon disconnects
without opening the card. The icon is a sibling of the full-card link, not nested inside it. Disconnect uses the same web
registry operation as the Machines page, preserves machine data, and refreshes connection state.
Action failures remain visible independently of the summary poll.
