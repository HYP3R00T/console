# Server

A Node.js/TypeScript Fastify application, listening on `127.0.0.1:3000`.

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | HTTP 200, `{"status":"ok"}`; HTTP liveness only. |
| GET | `/v1/connection` | HTTP 200, `{"product":"console","apiVersion":1}`; uncached protocol check. |

Other application paths return 404. Both endpoints are unauthenticated in this local development
increment. Browser origins are restricted to `http://127.0.0.1:3001` and `http://localhost:3001`
using an explicit Origin check and `@fastify/cors`; other browser origins receive 403.
The CORS plugin handles allowed GET preflights without enabling cookies. CORS is not authentication.

## Commands

After the [shared setup](../../README.md#development), run `mise run dev:server`.
For production, run `pnpm build`, then `pnpm --filter @console/server start`.
Fastify provides native JSON logs. Ctrl+C closes the server; development uses Node watch mode.
No tokens, data files, custom flags or environment configuration are used.

The [architecture](../architecture.md) maps source ownership. `test/app.test.ts` checks liveness
and a missing route; `test/connection.test.ts` checks the connection contract and origin policy.
These tests use Fastify injection without opening a port. Shared checks are in the
[README](../../README.md#checks). Use the owner's development processes without restarting them.
