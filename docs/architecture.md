# Architecture

Two independent applications share workspace tooling:

```text
Browser → Next.js (127.0.0.1:3001) → Hello World page
HTTP client → Fastify (127.0.0.1:3000) → GET /health
```

| File | Responsibility |
| --- | --- |
| `packages/server/src/app.ts` | Construct Fastify and register health; accepts native Fastify options. |
| `packages/server/src/main.ts` | Listen, enable native logging and close on SIGINT/SIGTERM. |
| `packages/server/test/app.test.ts` | Check health and a missing route without opening a port. |
| `packages/web/src/app/layout.tsx` | Required HTML/body layout and page metadata. |
| `packages/web/src/app/page.tsx` | Render the home page. |

There is no application integration, database, domain layer, custom UI library or launcher.
Node watch mode restarts the backend after source edits; Next.js owns web hot reload.
The root `dev:server` and `dev:web` scripts are also exposed as separate Mise tasks.

For each future increment, identify one user operation, its state owner and failure cases before
adding modules. Keep requirements and the feature inventory aligned with implemented behavior.
