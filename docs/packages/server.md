# Server

A minimal Node.js/TypeScript Fastify application. Its only application route is:

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | HTTP 200, `{"status":"ok"}` |

Health means the HTTP process can answer. No dependency readiness or agent functionality is implied.
Other application paths return Fastify's normal 404 response.

## Run

From the repository root, install tools with `mise install` and dependencies with
`pnpm install --frozen-lockfile`. Use `pnpm dev:server` for development, or `pnpm build`
then `pnpm --filter @console/server start` for the compiled server.
The server listens on `127.0.0.1:3000`. There are no custom startup flags, environment settings or storage.

`src/app.ts` constructs the app; `src/main.ts` owns listening and shutdown.
`test/app.test.ts` exercises the HTTP contract using Fastify injection without a listening socket.

## Verification

Run root `pnpm typecheck`, `pnpm test`, `pnpm build` and `prek run --all-files`.
New files also require `prek run --files` with explicit paths.
Use the owner's running development servers; do not start, stop or restart them without permission.
After this reset the owner should restart existing development processes to unload removed code.
