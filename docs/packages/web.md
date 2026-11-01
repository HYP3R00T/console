# Web app

The MVP Next.js client connects to one local Fastify backend. It presents registered projects,
work sessions, session configuration, history, native tool activity and explicit lifecycle controls.
The earlier machine tree, connection registry and advanced conversation controls are removed.

## Run and verify

Use the owner's existing `mise run dev` processes. The defaults are backend port 3000 and web port
3001, bound to loopback. Never start, stop or restart those development servers without instruction.
Run root `pnpm typecheck`, `pnpm test`, `pnpm build`, and `prek run --all-files`.

The website uses the local backend at `http://127.0.0.1:3000` without setup files or environment
variables. Its proxy never forwards browser authorization headers and rejects external origins,
redirects, unknown route families and oversized traffic. This
is a local-owner client, not remote user authentication. No saved machine registry is opened.

## Screens and source

- `/` and `/chat`: `components/workspace.tsx`, existing-directory project registration, rename,
  session creation/selection, configuration, messages, history, cancellation, recovery and deletion.
- `/settings`: `components/provider-settings.tsx`, supported ChatGPT login/prompt/cancellation.
- `lib/api.ts`: browser JSON contract; `/api/v1/*` is the same-origin route.
- `lib/server/proxy.ts`: fixed local backend; 256 KiB requests/8 MiB responses.
- `lib/poll.ts`: non-overlapping polling that aborts and suppresses stale results on cleanup.
- `lib/history.ts`: stable-ID history merge, retaining older loaded messages.
- `components/chat/markdown.tsx`: Markdown without raw HTML or automatic remote image requests.

Project and session selection are in the URL. Switching sessions remounts its read state; stale
poll responses cannot replace another session. Pending message identity/text is saved before sending
in sessionStorage and survives a tab reload. Retry is explicit and preserves both. Confirmed 4xx
rejection clears the pending identity; network/5xx failures retain it. No reconnect resubmits work.

Model/instruction configuration uses explicit Save while idle. Pending uncertain input prevents
configuration changes. A successful save is separate from sending a message; polling does not
overwrite unsaved configuration. Poll failures show disconnected/unknown status rather than success.

Tool calls and tool results retain native IDs, show bounded output and expose recorded errors.
Automatic compaction is retained; manual compaction, plans, reset, steering, delegation and forks
have no UI or API. Session deletion confirms complete history removal and retains project files.

## Verification limits

`test/client.test.ts` exercises proxy boundaries/token omission, history merge and polling cleanup.
Build/type checks validate the Next.js integration. No comprehensive browser automation or live
subscription inference is claimed. Tests never use personal accounts or permanently erase histories.

The existing shadcn/Tailwind theme remains. Biome checks TypeScript, JSX and CSS; RumDL checks Markdown.
