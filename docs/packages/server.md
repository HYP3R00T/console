# Server

`packages/server` is the private `@console/server` workspace package. It uses TypeScript,
Node.js LTS, and Fastify. It currently exposes only `GET /health`, returning `{"status":"ok"}`.
This checks HTTP liveness, not agent or storage readiness. Pi Durable, sessions, storage,
workspace access, and authentication are not integrated yet.

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

Pi Durable will sit behind the application's session operations. Add its adapter and session
routes when implementing the first agent workflow; do not create placeholder implementations
or claim persistence and recovery from the health endpoint.
