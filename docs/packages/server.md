# Server

A Node.js/TypeScript Fastify application, listening on `127.0.0.1:3000`.

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | HTTP 200, `{"status":"ok"}`; HTTP liveness only. |
| GET | `/v1/connection` | HTTP 200, `{"product":"console","apiVersion":1}`; uncached protocol check. |

The production/dev entrypoint also registers the provider endpoints below. API endpoints are unauthenticated in this local development
increment. Browser origins are restricted to `http://127.0.0.1:3001` and `http://localhost:3001`
using an explicit Origin check and `@fastify/cors`; other browser origins receive 403.
The CORS plugin handles GET/POST/PUT/DELETE preflights with Content-Type and without cookies. CORS is not authentication.

## Commands

After the [shared setup](../../README.md#development), run `mise run dev:server`.
For production, run `pnpm build`, then `pnpm --filter @console/server start`.
Fastify provides native JSON logs. Ctrl+C closes the server; development uses Node watch mode.
Provider storage is created automatically at `~/.local/share/console/providers.sqlite`. No custom flags
or environment file/configuration is required. The database contains private plaintext credentials
protected by mode 0600; do not publish it.

The [architecture](../architecture.md) maps source ownership. `test/app.test.ts` checks liveness
and a missing route; `test/connection.test.ts` checks the connection contract and origin policy.
These tests use Fastify injection without opening a port. Shared checks are in the
[README](../../README.md#checks). Use the owner's development processes without restarting them.

## Provider HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/providers` | Safe provider summaries, login methods and enabled count. |
| GET | `/v1/providers/:id/models` | Catalog metadata, favorites and availability flags. |
| POST | `/v1/providers/:id/login` | Start provider-owned login; body `{type: "api_key" or "oauth"}`. |
| GET | `/v1/provider-logins/:id` | Observe the current prompt/events/result. |
| POST | `/v1/provider-logins/:id/answer` | Answer `{promptId, value}`; values are never returned. |
| DELETE | `/v1/provider-logins/:id` | Cancel pending login. |
| PUT | `/v1/providers/:id` | Set `{enabled: boolean}`; stored credentials required. |
| DELETE | `/v1/providers/:id` | Cancel login and delete local credentials/favorites/cache. |
| POST | `/v1/providers/:id/refresh` | Explicit refresh for an enabled provider; static catalogs are no-ops. |
| PUT | `/v1/providers/:id/models/:model/favorite` | Set `{favorite: boolean}`; URL-encode model IDs. |
| GET | `/v1/models/favorites` | Only enabled, available favorite chat models. |

Configured means stored credentials, not validated inference access. Counts exclude disabled records.
Removal leaves the built-in provider discoverable as unconfigured and does not revoke upstream grants.
Responses are uncached; SDK/storage failures are sanitized. HTTP is sufficient for this configuration
workflow; no SSE or WebSocket endpoint is implemented yet. Login operations are transient; credentials
and favorites survive restart. `test/providers.test.ts` covers injected fake-provider login, OAuth,
cancellation/removal races, private persistence, credential redaction, favorites and validation/CORS.
