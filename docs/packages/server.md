# Server

`packages/server` is the private `@console/server` workspace package. It uses TypeScript,
Node.js LTS, and Fastify. It exposes `GET /health`, returning `{"status":"ok"}`, alongside the local Console API.
This checks HTTP liveness, not model access. Pi Durable supplies isolated persistent sessions; provider settings, model/thinking configuration, and credential storage are implemented. Workspace tools and Console user authentication are not implemented.

## Run and verify

From the repository root, run `mise install`, then `pnpm install --frozen-lockfile`.

- `pnpm dev:server`: run source with Node's watch mode.
- `mise run dev`: run the server and Next.js web app together, directly on the host.
- `pnpm --filter @console/server typecheck`: check source and test types.
- `pnpm --filter @console/server test`: run Node's test runner with Fastify HTTP injection.
- `pnpm --filter @console/server build`: compile source into `packages/server/dist`.
- `pnpm --filter @console/server start`: run the compiled server after building.

The server binds to `127.0.0.1:3000` by default. `HOST` and `PORT` override these values.
Port `0` lets the operating system select an available port; the listening address is logged.
`SIGINT` and `SIGTERM` close the HTTP server through Fastify's shutdown lifecycle.

## Structure and extension

- `src/app.ts` constructs the HTTP application without opening a port, making it directly testable.
- `src/main.ts` owns configuration, listening, logging, and process signals.
- `test/app.test.ts` exercises the HTTP surface without binding a network socket.

Node runs erasable TypeScript directly during development and tests. This does not check types;
run the separate type-check command. Production startup uses compiled JavaScript. Keep runtime
dependencies in this package's manifest, and review Biome fixes with the repository conventions.

The Pi integration remains in this package: `console.ts` wires routes, `providers.ts` relays Pi authentication, `credentials.ts` stores machine credentials, `sessions.ts` owns the session catalog, `session-routes.ts` validates session operations, and `conversation.ts` owns each harness. See [architecture](../architecture.md#first-pi-integration) for storage, request identity, and recovery semantics.

## Local API

All routes below use `/v1`; mutations require `X-Console-Request: 1`. JSON bodies are validated.

- `GET /providers`: safe configuration status, supported connection methods, and chat models with supported thinking levels and context capacity.
- `POST /providers/:id/refresh`: ask Pi to refresh a dynamic model catalog.
- `POST /connections`: start `{ "provider": "openai", "method": "oauth" }` (or `api_key`).
- `GET /connections/current` and `GET /connections/:id`: notifications and the current prompt.
- `POST /connections/:id/answer`: submit `{ "promptId": "...", "value": "..." }`.
- `DELETE /connections/:id`: cancel a pending flow; `DELETE /providers/:id`: remove saved credentials. Ambient credentials are unaffected.
- `GET /sessions`: named sessions and their current status; unavailable databases are reported individually.
- `POST /sessions`: create `{ "name": "...", "requestId": "unique-creation-id" }`; retries return the same session.
- `GET /sessions/:id`: recent history, partial answer, saved configuration, and lifecycle state.
- `PATCH /sessions/:id/config`: save `{ "provider": "...", "model": "...", "thinkingLevel": "high" }`. The level must be supported by that model. Unfinished work returns 409.
- `POST /sessions/:id/messages`: submit `{ "text": "...", "requestId": "unique-input-id" }` using saved settings; returns an admission identity with HTTP 202. Duplicate IDs identify the original input within that session.
- `POST /sessions/:id/cancel` and `POST /sessions/:id/resume`: explicit lifecycle controls.

The former unscoped `/conversation` and `/messages` development routes have been replaced. Existing conversation data is registered in place as the `default` session; no transcript or credential files are moved.

`CONSOLE_DATA_DIR` selects persistent storage. Tests always use temporary directories and Pi's scripted test provider; they never use personal credentials or paid inference. Live subscription login and inference require the user to complete provider authorization and are not verified by those tests.
