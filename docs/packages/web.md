# Web app

`packages/web` is the private `@console/web` workspace package. It uses Next.js App Router,
React, TypeScript, Tailwind CSS v4, and shadcn/ui. The current page is a development starter that checks the Fastify
server's health. It is not an agent dashboard yet.

## Run and verify

From the repository root, run `mise install`, then `pnpm install --frozen-lockfile`.

- `mise run dev` or `pnpm dev`: start both apps natively in parallel. Stop them with Ctrl+C.
- `mise run dev:server`: start only Fastify at `http://127.0.0.1:3000`.
- `mise run dev:web`: start only Next.js at `http://127.0.0.1:3001`.
- `pnpm --filter @console/web typecheck`: generate Next.js route types and check TypeScript.
- `pnpm --filter @console/web build`: create the web production build.
- `pnpm --filter @console/web start`: serve that build on loopback port 3001.

The browser calls `/api/health` on the web origin. A Next.js rewrite forwards that request
to Fastify's `/health` endpoint. `CONSOLE_API_URL` configures the target server origin,
defaulting to `http://127.0.0.1:3000`; restart Next.js after changing it. If the server's
`HOST` or `PORT` is changed, set this origin to match. No browser-exposed API URL or CORS
configuration is needed for the current health check. The rewrite target is build-time
configuration for a production build, so rebuild after changing it before `next start`.

`/health` confirms only that the HTTP server is alive. The page reports an unavailable
connection if the request fails; refresh after starting the server. It does not verify
agent execution, storage readiness, or user authentication.

## Structure and boundaries

- `src/app/layout.tsx`: shared document structure and metadata.
- `src/app/page.tsx`: the minimal client page and health request.
- `src/app/globals.css`: Tailwind imports and shadcn theme tokens.
- `src/components/ui/`: shadcn components, starting with the preset's Button.
- `src/components/theme-provider.tsx`: system light/dark mode through `next-themes`.
- `components.json`: shadcn component paths and style configuration.
- `next.config.ts`: the backend health rewrite.

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
