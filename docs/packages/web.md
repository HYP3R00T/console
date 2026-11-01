# Web app

A minimal Next.js/React website. `/` renders "Hello, world!" using browser-default styles.
There are no settings, UI component library, application API routes or backend connection.

## Source

- `src/app/layout.tsx`: required HTML/body layout and metadata.
- `src/app/page.tsx`: the home page.
- `next.config.ts` and `tsconfig.json`: framework and TypeScript configuration.

## Run and verify

After `mise install` and `pnpm install --frozen-lockfile`, run `pnpm dev:web`.
The website listens on `127.0.0.1:3001`. Production uses `pnpm build` followed by
`pnpm --filter @console/web start`. No environment file is required.

Root `pnpm typecheck` and `pnpm build` check the website; there is no browser test suite.
Root `pnpm test` runs the server HTTP smoke test. Repository checks use `prek run --all-files`.
Use the owner's existing development processes without starting, stopping or restarting them.
The owner should restart them after this reset to clear removed modules and dependencies.
