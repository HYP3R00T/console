# Console architecture

Two independent applications share workspace tooling. There is no application integration yet.

```text
Browser → Next.js (127.0.0.1:3001) → Hello World page
HTTP client → Fastify (127.0.0.1:3000) → GET /health
```

## Server

- `packages/server/src/app.ts` constructs Fastify and registers the health endpoint.
- `packages/server/src/main.ts` starts the listener and handles graceful shutdown on SIGINT/SIGTERM.
- `packages/server/test/app.test.ts` checks health and the absence of the former project endpoint.

The app factory allows HTTP tests without opening a port. There are no domain modules,
services, repositories, external runtimes or persistence layers.

## Website

- `packages/web/src/app/layout.tsx` supplies the required HTML/body layout and page metadata.
- `packages/web/src/app/page.tsx` renders the Hello World heading.

There are no custom styles, fonts, UI components, state stores, settings, API clients or proxies.
Next.js and React remain; Tailwind and the previous component system are removed.

## Future changes

Start each increment with one user operation, its state owner and its failure cases.
Add modules only when implemented responsibilities require them. Update requirements and the
feature inventory with concrete implementation and verification evidence.
