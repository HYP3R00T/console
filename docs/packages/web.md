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
| `src/components/details/` | Scoped details panel, conversation overview, runtime controls, tools/instructions and installed tool selection |
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
Console's shadcn theme with compact rounded composer controls. The header links to Home, Chat, and Settings; the left tree navigates machines, projects, sessions, and conversations. Agent configuration opens on demand. Conversation provider pickers show only connected providers; the connection-management page still offers other providers through search. On narrow screens the resizable panels stack vertically. Breadcrumbs show the local machine, saved workspace when present, and session.
The composer sends with Enter and inserts a newline with Shift+Enter; IME composition does not
submit. Text paste works normally. Image/file attachments and transcription are not implemented.
Conversation controls expose Pi's recorded usage/cost estimates; there is no account-wide billing dashboard.

## Try the integration

Run `mise run dev`, open `http://127.0.0.1:3001`, and follow **Provider settings**. Select OpenAI and **Sign in with ChatGPT** for the subscription flow; API key is a separate explicit choice. Other provider methods come from the installed Pi version. Authorization opens the provider's page; any requested code, selection, or credential is relayed to Pi through Fastify. Console itself has no account sign-in yet.

Return to the dashboard and create or select a named session. Open the combined model/thinking control, choose a model, and adjust its model-specific thinking slider. Model/thinking choices remain local until Send; changed configuration is confirmed before text admission. Provider setup stays in Settings. Unfinished work must complete or be cancelled before settings can change. Session selection is retained in the URL; unsent drafts and uncertain submissions stay separate per session while the page is open. Partial text and state are polled once per second. Network failure is shown separately from saved run status. An uncertain submission retains its request ID for retry while the page is open; reloading retrieves existing work without resubmitting. After backend restart, use Resume for interrupted work or Cancel to abandon it. New project conversations select native host coding tools. Tool selection is available in Conversation details → Tools & extensions.

Provider status means configuration exists, not that credentials or subscription entitlement have been tested. Environment-only providers require machine setup; Refresh models retrieves supported dynamic catalogs. The initial UI does not edit custom provider definitions or machine environment variables.

## Select tools

Open **Conversation details → Tools & extensions** to select installed tools and extensions while idle. Native coding
tools run directly on the host with the backend account's authority. The project identifies their
starting directory; it does not restrict access. There are no access presets or sandbox editor.
Model choice and thinking remain in the composer; machine and project settings retain their scopes.

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
selected conversation's model and working directory. New conversations inherit Main's saved settings.

Home is an overview; Conversations (`/chat`) is the work surface. The conversation sidebar
always offers a machine list with Configure and Add actions. Its shadcn Resizable handle supports
pointer and keyboard resizing. Machine/provider/model controls reuse shadcn Select.

New sessions use direct host execution and
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
requires Reload before editing again. Tool switches are limited to installed tools. Extension switches
select real Pi extensions and their sections/hooks; they execute with host authority. Existing conversations remain unchanged
until the user selects tools or updates their tool selection. No paid/live inference is used in UI checks.

The machine toggle changes its icon without a persistent selected background. Tree action menus
appear on hover/focus in their own reserved flex space; trailing metadata yields to the menu button. Rename replaces the label with an input;
Enter/blur saves and Escape cancels.
`components/chat/model-picker.tsx` renders one compact control showing the actual catalog model
name and its selected thinking level together. It opens a settings popover with a model-selection
row and a model-specific slider. The model list replaces the popover's content; selecting a
thinking-capable model returns to the slider without another click. Off-only models omit the
thinking suffix and slider; fixed-tier models show their value with an explanation.

The adjacent context ring uses the backend's saved `contextUsage` projection. Opening it shows
estimated tokens/capacity and a percentage. Unknown/invalid estimates remain unavailable rather
than becoming a fake zero. Over-capacity counts fill the ring while retaining the true percentage.
Tiny usage is labeled <0.1%. Cached offline data is identified. Model drafts do not recalculate
this saved estimate; model changes apply only on Send. This is context occupancy, not billing.
The popovers keep focus within their controls during model-list/settings navigation.

The rounded composer keeps text primary. Delivery choices render only for running work on a
backend with queue support. Guide now sends steering guidance; Queue next waits for the current
run; Keep draft disables submission until idle. Idle conversations have no delivery-mode button.
Stop remains available for unfinished work. Enter/Shift+Enter/IME and uncertain retries retain
their existing behavior. `/config` opens the model menu; other commands open the matching section.

On Send, `lib/chat/submission.ts` confirms changed configuration before submitting text. The
message retains its request ID and a confirmed-configuration flag across uncertain retries;
retrying already-admitted work does not reconfigure a running conversation. Rejected configuration
never admits the text. Configuration remains idle-only. These are sequential requests, not an
atomic transaction, so another client can still cause a conflict. Text and configuration drafts
survive conversation switches while chat is mounted; reload, page navigation and machine switches
reset them. Other editors retain their explicit Save actions. This focused fix changes no layout
or route ownership; it does not claim to eliminate all navigation remounts.

Five frontend tests verify configuration/admission ordering, unchanged settings, configuration
failure, uncertain retries and busy follow-ups. Desktop interaction verification is recorded in
the feature inventory after execution.

Trash offers Delete forever followed by a named confirmation. UI verification must not confirm
permanent deletion of personal data; erasure tests use temporary fixtures. Main/delegated entries
explain that their owning session must be deleted. Tool switches control the definitions offered to the model; bash retains host account authority.

## Resizable sidebar

The left navigation combines the existing collapsible sidebar/rail with the shadcn-style
Resizable primitives. It retains machine/project/conversation organization. A visible grip,
12px mouse target and 24px coarse-pointer target make the edge discoverable; arrow keys resize
the focused separator. The center remains chat, with an independently resizable details split.
Open sidebar/details percentages persist in sessionStorage and restore after collapse/reload,
subject to viewport constraints. Blocked storage falls back to in-memory resizing. The existing
compact stacked layout below 768px remains unchanged; this is not a new mobile drawer.

This follows the composition described by [Resizable](https://ui.shadcn.com/docs/components/base/resizable)
and [Sidebar](https://ui.shadcn.com/docs/components/base/sidebar), without introducing another
provider/state owner or a generated fixed-width sidebar around the panel group.

Only active separators render. A disabled separator hidden with display:none has zero geometry;
the installed panel library sorts hit regions by physical position, so that separator can precede
the left panel and suppress its drag target. Keyboard resizing previously worked while dragging
failed. Removing the hidden details separator restores pointer resizing without changing backend
state or remounting chat. Keep closed panel contents mounted, not their unused separators.

## Conversation switching

`lib/chat/navigation.ts` keeps at most 20 recent snapshots per mounted machine workspace.
A warm selection displays its cached snapshot immediately; the selected conversation's existing
poll refreshes it in the background. Cold selections fetch first and update URL, selected IDs and
snapshot together, keeping the previous chat visible rather than showing the welcome screen.
Initial load uses a stable skeleton. Failed navigation retains the current thread and reports an
error; aborted or superseded responses cannot change selection. Deleted conversation/session
projections are invalidated from the cache.

Only the selected conversation polls. No inactive conversation trees or background React roots
are kept mounted. Cache contents are read projections, not durable state, and are discarded when
chat unmounts or the machine changes. Conversation components still initialize separately;
scroll position, expanded activity and paginated older history are not retained across switches.
Model/text drafts remain separate per conversation while chat is mounted. Cache capacity eviction
requires a cold read on the next visit. Same-machine settings and connection navigation retains
the mounted chat; a machine change still clears its local state.

## UI responsibilities

`components/layout/console-shell.tsx` owns the persistent workspace and its settings/back header.
`/` and `/chat` render chat; `/settings`, `/machines` and project management use the center pane
without unmounting the machine tree or chat. Unsent chat text, local model choices and mounted
conversation disclosures survive same-machine management navigation. `lib/workspace-location.ts`
remembers the return-to-chat URL per tab. Explicit chat URLs are synchronized into the existing
hook rather than requiring a new workspace mount. Machine changes still remount client state.

Settings shows machine cards, then Model menu, Providers and Machine defaults sections. Their
forms remain mounted across section changes and inactive machine/provider reads stop. Credentials
and defaults belong to the selected machine; menu favorites remain web-server preferences.
Provider catalogs expand into model rows with context capacity and supported thinking levels.
`components/models/provider-settings.tsx` owns authentication UI; `/settings/providers` redirects
to its settings section. Adding a machine opens the existing connection forms in the center pane.

Machine gears open Settings for that machine. Every machine exposes Add project, including when
it already has projects; this opens the existing repository-clone/directory-registration page.

Chat reserves permanent space only for the machine tree and conversation. The header's Details
button toggles a resizable desktop split, with an overlay below 768px. Escape closes it and returns
focus. Opening/closing explicitly sets the group layout after panel constraints register, returning
space to the conversation rather than growing the tree. Desktop sidebar/details proportions persist per browser tab, including reloads.

The panel identifies the selected conversation; project/machine settings have scoped entry points.
The inspector has one conversation scope. Usage & context, Current work, Instructions & resources,
and Tools & extensions expand on demand. A reported plan appears only when one exists. Instruction
drafts stay in the shared panel owner across disclosure changes; closed/hidden sections stop reads.
Project files/skills/prompts are folded separately from the conversation instructions editor.
Project settings and memory open from the sidebar or footer link, with a back action. Machine
operator data is under Settings → Machine defaults → Advanced machine data; it is no longer a
conversation scope selector. A fork/child shows its parent's human-visible name.
Shared-state JSON editing and long technical details stay behind disclosures. Runtime task dependencies
explicitly identify that they span the underlying session. They are not a to-do list.

## Project navigation and creation

The tree shows machine → project → conversation, with project folders directly beneath each
machine and no redundant Projects heading. Each project owns one hidden Pi runtime; no session container is shown.
New conversation selects the created thread. Additional conversations sit alongside the first;
forks/subagents remain beneath their parent. Conversation menus rename/trash only that thread,
even when it is the final visible conversation. The hidden runtime remains for project memory and
future threads. Permanent erasure of initial/delegated history still requires the full runtime-history
maintenance API; the web does not expose that destructive operation.

Each machine row has a square hover/focus Add project plus button. `components/projects/dialog.tsx` uses the shadcn
Base UI Dialog and shared Select/Button components for a name and an existing machine-local folder,
a new folder, or a public GitHub clone. Requests target that machine explicitly and preserve their
idempotency key when retried unchanged. Clone state remains visible through project controls.
Hover changes opacity and row background without resizing action buttons or shifting labels.

## Project conversation creation

Each project row has a square New conversation plus button visible on hover/focus and on touch.
The menu, empty-state button and `/new` command use `POST /workspaces/:id/conversations`.
The server creates/reuses the single project runtime, reuses unused Main for the first thread,
and creates independent conversations thereafter. Request IDs survive uncertain retries. Selection
uses the returned runtime/conversation IDs; typing adds messages without creating another runtime.
There is no new-session command, session row, session breadcrumb or session Trash section.
Model settings remain conversation-specific; native coding tools execute directly on the host.

Project settings show metadata and a folded Project memory JSON editor. All conversations can
explicitly read/update the same revisioned memory through read_state/update_state; their full
histories remain separate. `/state` opens this project scope. Machine operator JSON is a separate
control and is not the model's project memory. Project memory polling stops when details close.

Same-level conversation rows reserve the same disclosure slot. Fork/delegation ancestry stays
nested. Expansion choices persist by stable connection/project/conversation IDs across reloads.
Saved collapse choices take precedence over defaults. The breadcrumb shows machine, project and
conversation; Resume project work names the shared scheduler's scope.

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
labels for saved compaction summaries and handoff entries. Current work also exposes session-wide ownership,
wait dependencies, sleep deadlines, cancellation and blocked reasons. Transport remains polling;
tool output is not a continuous byte stream. See the [Console feature inventory](../features.md).

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
into its arguments and recorded output. Native command output is presented with its exit code; file
contents stay code-like, not rendered Markdown. Long content is bounded and scrollable. Tool output
availability still follows the existing backend; this redesign does not add byte-by-byte terminal streaming.

Replies support Markdown lists, tables, links and fenced code. Raw HTML is not executed and remote
images become links. Rendering never removes records from Pi. Disclosure clicks pause automatic
following and Jump to latest restores it; polling preserves mounted disclosure state. Older pages can
merge into a grouped activity while retaining an anchor through its source message aliases.

Plans come only from recorded update_plan results or the persisted plan document. The latest plan
for an activity shows a completed/total count and per-step states, opens while active, and collapses
when complete unless manually overridden. Plan statuses are agent-reported. Existing conversations
can enable update_plan in Tools or update their tool selection; new conversations include it in
the coordination tools. The State tab continues to refer to machine-wide shared JSON, not this plan.

## Composer and details design evidence

The redesign uses a text-first composer, compact controls and progressive disclosure. References
include the public [ChatGPT interface](https://chatgpt.com/), its
[project settings documentation](https://help.openai.com/en/articles/10169521-projects-in-chatgpt),
and Anthropic's [official project/artifact screenshots](https://www.anthropic.com/news/projects).
The Anthropic screenshots date from 2024 and are design references, not evidence of today's
authenticated application. No competitor account was signed into or inference submitted.

Desktop browser checks verified the absent idle delivery button, separate model/thinking controls,
new disclosure organization and retained unsaved instruction text across sections. A Low → Medium
adjustment preserved the thinking popup rectangle `[489,546,224,105.328125]`; Low was restored.
A compiled React rendering check verifies idle/running/unsupported delivery-control states without
paid inference. Existing navigation caching, local drafts and sidebar resizing are retained.

## Model-specific thinking capabilities

The backend already exposes `getSupportedThinkingLevels(model)` from installed Pi AI 1.4.0 as
each catalog model's `thinkingLevels`. The composer now uses that entire ordered list without
applying global thinking preferences or injecting a saved unsupported tier. A model change keeps
the current level only if supported, otherwise selects the model's first supported level locally.
Off-only/unknown models have no thinking control. A single non-off tier opens an explanation with
its fixed value; multiple tiers use one slider stop per reported value, with all labels visible.
These are Pi's normalized tiers, not an editor for provider-native token budgets or every API option.
Model-menu preferences still filter models; their former global thinking checkbox editor is removed.
Previously stored thinking preferences no longer restrict chat. Selection remains local until Send.

Evidence: the installed Pi AI implementation and
[upstream thinking documentation](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md#thinkingreasoning).
Five focused frontend tests cover off-only/unknown catalogs, extended levels, model-switch fallback,
fixed thinking and catalog labels without a frontend tier vocabulary.

## Combined composer control verification

The supplied interface screenshots informed a combined model/selected-thinking label and an
adjacent context occupancy ring. These use Console's existing backend estimates and Pi capability
metadata. Five context tests cover missing/invalid data, zero occupancy, normal saved capacity,
small nonzero occupancy and over-capacity estimates. No additional backend request or polling
loop is introduced by either popover. Existing local-until-Send behavior is preserved.

## Unified workspace verification

The composer model/thinking trigger fits its contents rather than reserving 224 px. Every model
group names its provider, including a single connected provider. Pi metadata controls Off; models
without it explain required thinking. No catalog override or new inference API is introduced.
The [installed catalog audit](../model-catalog-audit.md) records why Terra is missing, live browser
checks, multiple-provider fixture coverage and unverified multi-machine/provider limits.
