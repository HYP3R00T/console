# Server

A Node.js/TypeScript Fastify application, listening on `127.0.0.1:3000`.

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | HTTP 200, `{"status":"ok"}` |

Other application paths return 404. Health indicates HTTP liveness only.

## Commands

Run from the repository root after the [shared setup](../../README.md#development):

```bash
mise run dev:server
```

For production, run `pnpm build`, then `pnpm --filter @console/server start`.
Fastify provides native JSON logs. Ctrl+C closes the server; development uses Node watch mode.
No custom flags, configuration or storage are provided.

See [architecture](../architecture.md) for the source map and the [README](../../README.md#checks)
for checks. The HTTP test uses Fastify injection and does not start a listening server.
