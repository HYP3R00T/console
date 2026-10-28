# Web app

`packages/web` is the private `@console/web` workspace package. It uses Next.js App Router,
React, TypeScript, Tailwind CSS v4, and shadcn/ui. The current page is a dashboard with a session sidebar, conversation/composer, configuration inspector, and machine-level provider settings.

## Run and verify

From the repository root, run `mise install`, then `pnpm install --frozen-lockfile`.

- `mise run dev` or `pnpm dev`: start both apps natively in parallel. Stop them with Ctrl+C.
- `mise run dev:server`: start only Fastify at `http://127.0.0.1:3000`.
- `mise run dev:web`: start only Next.js at `http://127.0.0.1:3001`.
- `pnpm --filter @console/web typecheck`: generate Next.js route types and check TypeScript.
- `pnpm --filter @console/web build`: create the web production build.
- `pnpm --filter @console/web start`: serve that build on loopback port 3001.

The browser calls `/api/health` and `/api/v1/*` on the web origin. A Next.js rewrite forwards that request
to Fastify's corresponding routes. `CONSOLE_API_URL` configures the target server origin,
defaulting to `http://127.0.0.1:3000`; restart Next.js after changing it. If the server's
`HOST` or `PORT` is changed, set this origin to match. No browser-exposed API URL or CORS
configuration is needed for the current health check. The rewrite target is build-time
configuration for a production build, so rebuild after changing it before `next start`.

`/health` confirms HTTP liveness only. The dashboard polls session endpoints and marks disconnected history as potentially stale; successful configuration does not prove model access or user authentication.

## Structure and boundaries

- `src/app/layout.tsx`: shared document structure and metadata.
- `src/app/page.tsx`: session selection, polling, and session-scoped drafts/submission identities.
- `src/components/session-sidebar.tsx`: named session creation and navigation.
- `src/components/session-chat.tsx`: transcript, composer, and cancel/resume controls.
- `src/components/session-inspector.tsx`: persisted provider, model, and supported thinking-level controls.
- `src/app/settings/providers/page.tsx`: provider configuration and model-catalog refresh.
- `src/components/provider-connection.tsx`: generic Pi prompts, OAuth links, device codes, and cancellation.
- `src/lib/console-api.ts`: browser API calls and view types; no provider SDKs or persisted secrets.
- `src/app/globals.css`: Tailwind imports and shadcn theme tokens.
- `src/components/ui/`: shadcn components, starting with the preset's Button.
- `src/components/theme-provider.tsx`: system light/dark mode through `next-themes`.
- `components.json`: shadcn component paths and style configuration.
- `next.config.ts`: health and versioned API rewrites.

Keep server-owned execution, workspace access, and permissions in Fastify. Next.js can
provide routing, layouts, and future login UI, but that does not replace backend authorization.
Authentication, shared sessions, and team access have not been implemented.

## Styling and components

Preset `bddBUJXM` selects Lyra styling, zinc colors, Geist, and Lucide icons. Geist is
self-hosted by Next.js after its build-time download. Tailwind runs through
`postcss.config.mjs`; Biome's CSS parser supports Tailwind directives.

Run shadcn commands from `packages/web`. Use `pnpm dlx shadcn@latest add <component>`
to add a component. The applied theme can be restored with
`pnpm dlx shadcn@latest apply --preset bddBUJXM`. Review generated changes and run
the repository checks afterward. The `@/*` alias maps to `src/*`.

`next-env.d.ts`, `.next/`, and TypeScript build caches are generated and ignored. Next.js
generates its declarations when running `dev`, `build`, or the `typegen` step in `typecheck`.
Automatic Next.js agent-rule generation is disabled; repository instructions remain in root `AGENTS.md`.

## Try the integration

Run `mise run dev`, open `http://127.0.0.1:3001`, and follow **Provider settings**. Select OpenAI and **Sign in with ChatGPT** for the subscription flow; API key is a separate explicit choice. Other provider methods come from the installed Pi version. Authorization opens the provider's page; any requested code, selection, or credential is relayed to Pi through Fastify. Console itself has no account sign-in yet.

Return to the dashboard and create or select a named session. Choose a provider, model, and supported thinking level in the inspector, then save settings before sending a message. Unfinished work must complete or be cancelled before settings can change. Session selection is retained in the URL; unsent drafts and uncertain submissions stay separate per session while the page is open. Partial text and state are polled once per second. Network failure is shown separately from saved run status. An uncertain submission retains its request ID for retry while the page is open; reloading retrieves existing work without resubmitting. After backend restart, use Resume for interrupted work or Cancel to abandon it. No workspace files or commands are available to the model.

Provider status means configuration exists, not that credentials or subscription entitlement have been tested. Environment-only providers require machine setup; Refresh models retrieves supported dynamic catalogs. The initial UI does not edit custom provider definitions or machine environment variables.
