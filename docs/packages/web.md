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

App Router files select screens and API handlers; domain folders own their implementation.
The chat route is a thin entry point to `components/chat/workspace.tsx`.

| Folder | Owns |
| --- | --- |
| `src/app/` | Routes, layouts, global styles and same-origin API handlers |
| `src/components/chat/` | Transcript/composer/model picker, chat request state, history and workspace layout |
| `src/components/details/` | Scoped details panel, conversation overview, runtime controls, tools/instructions and sandbox editor |
| `src/components/navigation/` | Sidebar composition, machine/conversation branches, persistent disclosure, row menus and Trash |
| `src/components/machines/` | Connection context/UI, settings, shared state and project-tree loading |
| `src/components/models/` | Model preferences, provider settings and authentication prompts |
| `src/components/projects/` | Project creation, inspection and resource selection |
| `src/components/layout/` | Shared application shell and theme provider |
| `src/components/shared/` | Reusable domain-neutral form/confirmation controls |
| `src/components/ui/` | Existing shadcn primitives; generated component configuration stays here |
| `src/lib/api.ts` | Shared browser view types and authenticated same-origin API client |
| `src/lib/chat/` | Pure history merging and transcript projection |
| `src/lib/server/` | Web-server connection registry/proxy and SSH transport; never import into client components |

`chat/use-chat-session.ts` owns polling, URL selection, drafts, stable request identities and
mutations. `chat/use-workspace-layout.ts` owns panel state, resizing, responsive layout and focus.
The workspace composes Navigation, Content and Details without introducing a second state store.
The details panel keeps conversation forms mounted when hidden; shared machine state has a separate
component/lifecycle. `navigation/branch.tsx` owns persistent expansion; tree API polling belongs to
`machines/use-project-tree.ts`. Keep these ownership boundaries when adding a control.

Tree refreshes use two requests per machine: projects plus sessions with bundled conversation
summaries. Older servers that omit the bundle retain per-session conversation requests. The
small `lib/poll.ts` helper schedules only after completion, aborts on cleanup and suppresses late
callbacks. Tree/runtime/shared-state pollers use it without adding a cache or dependencies.
Closing details or switching scope stops hidden runtime/shared-state polling while retaining
mounted form drafts. Opening the relevant section resumes immediately; resource discovery waits
until Instructions is visible. Transcript and connection polling keep their existing cadence.

`components.json` retains shadcn aliases and theme configuration. `next.config.ts` has no default
backend rewrite. Server-owned execution, workspaces and authority stay in Fastify; the Next.js
proxy does not replace backend authorization. Team authentication remains unimplemented.

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
submit. Text paste works normally. Image/file attachments and transcription are not implemented.
Conversation controls expose Pi's recorded usage/cost estimates; there is no account-wide billing dashboard.

## Try the integration

Run `mise run dev`, open `http://127.0.0.1:3001`, and follow **Provider settings**. Select OpenAI and **Sign in with ChatGPT** for the subscription flow; API key is a separate explicit choice. Other provider methods come from the installed Pi version. Authorization opens the provider's page; any requested code, selection, or credential is relayed to Pi through Fastify. Console itself has no account sign-in yet.

Return to the dashboard and create or select a named session. Choose a model from the composer list and adjust its discrete thinking slider. Changes save immediately; provider setup stays in Settings. Unfinished work must complete or be cancelled before settings can change. Session selection is retained in the URL; unsent drafts and uncertain submissions stay separate per session while the page is open. Partial text and state are polled once per second. Network failure is shown separately from saved run status. An uncertain submission retains its request ID for retry while the page is open; reloading retrieves existing work without resubmitting. After backend restart, use Resume for interrupted work or Cancel to abandon it. New project conversations enable project-confined coding tools and commands with network blocked. Expand **Sandbox** under Conversation → Access to narrow or disable access, or explicitly allow network access. Existing policies are preserved until changed.

Provider status means configuration exists, not that credentials or subscription entitlement have been tested. Environment-only providers require machine setup; Refresh models retrieves supported dynamic catalogs. The initial UI does not edit custom provider definitions or machine environment variables.

## Configure a sandbox

Open **Conversation → Access → Sandbox** in the details panel. Select an existing absolute workspace and enable sandboxed tools. The workspace is readable by default; leave writable directories empty for read-only use and keep network blocked unless needed. Additional directory grants use one absolute path per line. Save explicitly while the session is idle. Unsaved sandbox changes block Send, just like unsaved model settings.

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
resizable desktop split; on narrow screens it becomes a right-side overlay. Closing preserves mounted drafts. Nodes use shadcn Base UI Collapsible; right-click opens creation, rename, settings,
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
`components/chat/model-picker.tsx` uses a compact shadcn Popover with the configured model list and a
native discrete range control for supported, preferred thinking levels (including the saved level).
There is no search field or permissions shortcut. Model selection saves immediately; the slider
saves on release, keyboard adjustment or blur, with one commit per adjustment. Failures remain
visible and the slider restores its saved value. Provider/catalog management stays in Settings.

Trash offers Delete forever followed by a named confirmation. UI verification must not confirm
permanent deletion of personal data; erasure tests use temporary fixtures. Main/delegated entries
explain that their owning session must be deleted. Tool setup remains explicit: state/delegation
can be enabled without granting files; the workspace editor is expanded when its policy is off.

## UI responsibilities

`components/layout/console-shell.tsx` owns the icon-only Home, Chat, and Settings navigation. Settings is a real
`/settings` page with Model choices, Machine defaults, and Providers sections. Its machine selector
scopes provider credentials and defaults; model menu preferences belong to the web server.
`components/models/provider-settings.tsx` contains provider UI; `/settings/providers` remains a compatible entry point.
Machine gears open Settings for that machine. Every machine exposes Add project, including when
it already has projects; this opens the existing repository-clone/directory-registration page.

Chat reserves permanent space only for the machine tree and conversation. The header's Details
button toggles a resizable desktop split, with an overlay below 768px. Escape closes it and returns
focus. Opening/closing explicitly sets the group layout after panel constraints register, returning
space to the conversation rather than growing the tree. User resizing is remembered while mounted.

The panel identifies its selected entity and offers Conversation, Project and Machine scopes.
Conversation sections are Overview (reported plan and folded usage/context), Activity (active model/
tool tasks), Access (sandbox summary/editor and folded tool selection), and Instructions (project
resources, custom instructions and folded extensions). Machine owns shared state and machine-settings
navigation. Project owns project name/path/status. A fork/child shows its parent's human-visible name.
Shared-state JSON editing and long technical details stay behind disclosures. Runtime task dependencies
explicitly identify that they span the underlying session. They are not a to-do list.

## Project navigation and creation

The tree shows machine → project → conversation; Projects is a collapsible section without an additional indentation level. Default collects conversations
without an explicitly selected project; it is a real backend registration, not a synthetic folder.
The initial Main conversation uses its session name until renamed. Session containers stay internal;
additional roots appear beside the initial conversation and forks/subagents nest beneath their parent.
Deleting the last remaining conversation uses session deletion so the backend lifecycle stays valid.

The Projects heading has a square hover/focus plus button. `components/projects/dialog.tsx` uses the shadcn
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

Project settings show only project controls; shared state belongs to Machine. Conversation Access
contains tool selection, including Console compatibility tools and native Pi read/write/edit/bash,
all under the same saved grants. Same-level conversation rows reserve an identical disclosure slot;
clicking any expandable row (including its name or chevron) toggles it; a conversation row also
selects that conversation. Expansion choices persist in localStorage, keyed by connection and stable
project/session/conversation IDs, so renames and reloads retain them. Explicit saved choices take
precedence over automatic defaults; navigation and polling do not reopen a collapsed branch. Fork and delegated
agent icons distinguish ancestry without adding a redundant Projects tree level. Machine chat counts
include roots, forks and children rather than counting hidden session containers.

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
worker output is not a continuous byte stream. See the [Console feature inventory](../features.md).

Project resources in Conversation controls lists loaded instruction sources and indexed skills/templates.
Use skill/template fills the composer without sending. Add the request or template arguments and
send explicitly. Reload resources refreshes the index; instructions are also refreshed on model requests.
The supported commands are `/skill:name request` and `/prompt:name arguments`, with positional
parameters and quoted arguments. Instructions stay inside the approved workspace. Exact Pi CLI
configuration/plugin compatibility is not promised. An older connected server shows unavailable
runtime controls and retains legacy text submission until the operator restarts the updated backend.

## Compact transcript and activity

`lib/chat/transcript.ts` projects saved messages into readable replies and contiguous activity groups.
`components/chat/message.tsx` renders user bubbles and Markdown replies, with accessible copy/fork icon buttons.
There are no repeated You/Assistant headings or fork buttons on internal tool-call turns.
`components/chat/activity.tsx` composes the existing shadcn Trace primitives for tools, terminal output,
reasoning, context boundaries and plans, following the AI Elements Message/Tool/Terminal/Plan patterns.

Completed activity is collapsed. Running activity opens automatically; users can close it while work
continues. Failures remain identified in the summary even when folded. Each call expands independently
into its arguments and recorded output. Terminal JSON is presented as stdout/stderr/exit code; file
contents stay code-like, not rendered Markdown. Long content is bounded and scrollable. Worker output
availability still follows the existing backend; this redesign does not add byte-by-byte terminal streaming.

Replies support Markdown lists, tables, links and fenced code. Raw HTML is not executed and remote
images become links. Rendering never removes records from Pi. Disclosure clicks pause automatic
following and Jump to latest restores it; polling preserves mounted disclosure state. Older pages can
merge into a grouped activity while retaining an anchor through its source message aliases.

Plans come only from recorded update_plan results or the persisted plan document. The latest plan
for an activity shows a completed/total count and per-step states, opens while active, and collapses
when complete unless manually overridden. Plan statuses are agent-reported. Existing conversations
can enable update_plan in Tools or reapply the saved sandbox policy; new conversations include it in
the coordination tools. The State tab continues to refer to machine-wide shared JSON, not this plan.
