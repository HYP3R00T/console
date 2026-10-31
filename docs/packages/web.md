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

| Folder                       | Owns                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/app/`                   | Routes, layouts, global styles and same-origin API handlers                                                    |
| `src/components/chat/`       | Transcript/composer/model picker, chat request state, history and workspace layout                             |
| `src/components/details/`    | Scoped details panel, conversation overview, runtime controls, tools/instructions and installed tool selection |
| `src/components/navigation/` | Sidebar composition, machine/conversation branches, persistent disclosure, row menus and Trash                 |
| `src/components/machines/`   | Connection context/UI, settings, shared state and project-tree loading                                         |
| `src/components/models/`     | Model preferences, provider settings and authentication prompts                                                |
| `src/components/projects/`   | Project creation, inspection and resource selection                                                            |
| `src/components/layout/`     | Shared application shell and theme provider                                                                    |
| `src/components/shared/`     | Reusable domain-neutral form/confirmation controls                                                             |
| `src/components/ui/`         | Existing shadcn primitives; generated component configuration stays here                                       |
| `src/lib/api.ts`             | Shared browser view types and authenticated same-origin API client                                             |
| `src/lib/chat/`              | Pure history merging and transcript projection                                                                 |
| `src/lib/server/`            | Web-server connection registry/proxy and SSH transport; never import into client components                    |

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

## Workspace and settings

`/` and `/chat` show the workspace. The machine → project → conversation tree remains mounted
while settings/connections replace the center pane. There is no user-visible session layer.
The header returns to chat from management routes. Settings uses machine cards and sections for
model-menu preferences, providers and machine defaults. Provider credentials/defaults belong to
the selected machine; model-menu favorites belong to the web server.

The left sidebar collapses to a rail and resizes by pointer or keyboard. Its visible separator
has larger coarse-pointer targets. An optional details split resizes independently; narrow
layouts use the existing stacked layout and details overlay. Panel proportions persist per tab
in sessionStorage, subject to viewport constraints. Tree expansion persists by stable IDs.

Each project can attach an existing backend-local directory, create a directory, or clone a
public GitHub repository through its Add project dialog. New conversation creates/reuses the
project's hidden runtime and selects a thread using a retry-stable creation ID. Forks/subagents
remain nested under their parent. Rename/Trash/Restore actions operate on the selected record;
project deletion retains source. Permanent deletion requires the eligible Trash/confirmation path.

Project settings show metadata and explicit revisioned project memory. Conversations share that
memory and files, not merged transcripts. Machine operator JSON is a separate advanced setting.
Tools & extensions selects actual installed definitions while idle; there is no sandbox editor,
arbitrary package installer or hook editor. Native tools retain the backend account's authority.

## Conversation state and sending

The workspace is client-rendered React state inside Next.js route shells. Browser polling loads
runtime data; transcripts are not server-rendered per conversation. Next.js API handlers own the
connection registry/proxy, while Fastify owns execution and persistence.

`chat/use-chat-session.ts` owns selection, polling, drafts and submissions.
`chat/use-workspace-layout.ts` owns resizing, disclosure scopes and focus. The shell retains the
mounted chat during same-machine settings/connections navigation. Switching machines remounts
client state; reload also discards unsent drafts and uncertain browser-side retry identities.

The bounded cache keeps 20 recent conversation snapshots. Warm switches show cached data and
refresh it; cold switches retain the previous conversation until the requested identity, URL and
snapshot can commit together. Superseded/aborted reads cannot overwrite a newer selection.
Failed navigation leaves the previous thread visible. Scroll position, expanded activity and
older history pages are not preserved across conversation components.

Text and model/thinking choices are local per-conversation drafts until Send; polling must not
overwrite them. `lib/chat/submission.ts` confirms changed configuration before message admission.
A failed configuration save admits no text. Uncertain sends retain their request ID, delivery
mode and confirmed-configuration flag, so retry does not reconfigure already-admitted work.
Configuration/admission are sequential requests, not an atomic transaction across clients.
Other settings editors retain explicit Save actions.

The model/thinking control and context ring stay compact. Thinking changes are local; the ring
shows saved backend-estimated context occupancy, not account billing or a projection for an
unsent model choice. Unknown/offline data is labeled rather than invented as zero.

Delivery choices appear only during running work when the backend supports them. Steering,
queued follow-up and idle-only behavior retain their admission semantics; Enter sends,
Alt+Enter queues, Shift+Enter inserts a newline, and IME composition does not accidentally send.
Withdraw targets queued input. Interrupted work requires explicit Resume/Cancel; restarting the
browser does not resubmit work. Resume operates the shared project scheduler.

## Transcript and activity

Markdown uses react-markdown/remark-gfm for lists, code, links and tables. Raw HTML is disabled;
remote images become links rather than automatic fetches. Pi's visible reasoning blocks are
shown, while redacted content and provider signatures remain server-side.

The transcript pairs tool calls/results by ID, including out-of-order parallel completion and
results from outside the loaded history page. Missing results remain unknown/interrupted.
Completed activity collapses; live work opens by default and manual disclosure choices persist
while mounted. Failures stay marked even when folded. Arguments/output expand independently,
with bounded scrolling and native exit-code metadata. This is not byte-by-byte terminal streaming.

Plans come from `update_plan` records and the saved plan document, never inferred from prose.
They report agent progress rather than successful verification. Existing conversations must
select the tool to use it. Context boundaries, reset and compaction retain history.

History uses anchored pagination. Inspecting output or scrolling upward pauses bottom-following;
Jump to latest resumes it. Message aliases retain anchors when older pages join grouped activity.
The selected transcript polls every second; project/session lists use their existing two-second
refresh. Hidden detail sections stop their own inspection/resource reads. No SSE/event transport
or comprehensive browser-reconnect suite is implemented.

## Model catalog and thinking

Provider/model choices come from the selected backend's Pi AI catalog. Composer groups name their
provider; settings expands provider groups with context capacity and thinking metadata.
Provider-qualified favorites keep equal model IDs from different providers separate. Current
selections are retained without fabricating a missing catalog entry.

Thinking uses Pi's `getSupportedThinkingLevels()` projection. Off appears only if supported;
required-thinking models explain its absence. Off-only/unknown models have no thinking slider;
a fixed non-off tier is shown without an editable range. Otherwise each reported tier is one
slider stop. A model switch retains a supported tier or selects the new model's first tier locally.
These normalized tiers are not an editor for every provider-native option or token budget.

Earlier local inspection on 2026-10-31 found GPT-6.1 Terra in the Pi CLI catalog but absent from
Console's npm Pi AI catalog despite both reporting 1.4.0. That observation is not an entitlement
or inference result, and must be rechecked after dependency changes. The UI cannot fix a missing
backend catalog row. Reload catalog rereads published machine data; it does not upgrade Pi.
Compare CLI output, installed package data and `/v1/providers` before diagnosing a UI filter bug.

Model fixtures cover provider grouping, favorites, missing entries and model-specific thinking;
context tests cover unknown/zero/over-capacity estimates. Live OpenRouter authentication,
multiple-machine browser switching and every provider/model combination remain unverified.

## Try the integration

1. Use the existing `mise run dev` servers and open `http://127.0.0.1:3001`.
2. Explicitly connect/select a backend and register or select a project.
3. Open Settings → Providers. For supported subscription access choose Sign in with ChatGPT;
   API key is a separate choice. Complete the provider's authorization flow yourself.
4. Select/create a conversation under the project, choose a model/thinking tier and send text.
5. Inspect activity and Conversation details; use Tools & extensions only while idle.
6. Close/reopen chat to inspect persisted work. After backend interruption, use Resume or Cancel.

Provider configuration is not proof of access. Environment-only providers require backend setup.
Custom provider definitions, attachments/transcription, file browsing, PWA installation, remote
web login and an application command palette are not implemented in this checkout. Verification
must use disposable data; do not permanently erase personal history or submit paid inference as
an incidental UI check. The [feature inventory](../features.md) owns remaining work.
