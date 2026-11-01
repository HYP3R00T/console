# Server

The MVP backend is TypeScript, Node.js and Fastify around Pi Durable 1.4.0. It manages existing-directory
projects and independent work sessions, each with one conversation. No compatibility aliases are provided.

## Run and checks

Use `mise install`, then `pnpm install --frozen-lockfile`. The owner runs `mise run dev`; agents must
not start, stop or restart those development servers. Source changes need a backend restart when
removed modules or changed runtime assembly leave old instances in memory.

From the root run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `prek run --all-files`.
New files also require `prek run --files` with their explicit paths, without staging.

The backend starts on `127.0.0.1:3000` and stores data in `~/.local/share/console` automatically.
No environment file, environment variables or configuration file is required. Optional startup
arguments are `--port <number>` and `--data-dir <absolute-path>`; `--help` prints usage.
Changing the data directory selects another data set, not a migration.

```bash
pnpm --filter @console/server start
pnpm --filter @console/server start --port 3100 --data-dir /absolute/path/to/data
```

The bundled website expects the default backend port. Other clients can use the address printed
by the backend. Remote hosting and frontend connection configuration remain outside the local MVP.
The supported production provider is Pi's `openai-codex` ChatGPT login route. No API-key fallback or
billing route is chosen silently. Scripted providers are injected only in tests.

## Structure

| Source | Owns |
| --- | --- |
| `main.ts`, `app.ts` | Process lifecycle and Fastify construction |
| `http/console.ts` | Authentication, errors, provider routes and composition |
| `models/` | Pi credential adapter and provider login bridge |
| `platform/configuration.ts` | Storage location |
| `projects/catalog.ts` | Existing directory registration and metadata |
| `sessions/service.ts` | Session catalog, project serialization and lifecycle invariants |
| `sessions/routes.ts` | Project/session HTTP schemas and handlers |
| `runtime/session.ts`, `runtime/view.ts` | Pi assembly, operations and read projections |

The application service is the only owner of lifecycle serialization. Do not add another queue in
routes or the Pi adapter. Do not write Pi tables directly; whole-session deletion closes its Harness
and removes its dedicated storage directory.

## API contract

An endpoint is an HTTP method plus path mapped to an application operation. Its contract also defines
input, validation, access, response and errors. IDs are opaque UUIDs, not filesystem paths.

All application endpoints use `/v1`. JSON mutations require `X-Console-Request: 1`; bearer authentication
is available to embedded applications through the `createApp` accessToken option. The standalone
MVP is loopback-only; both Host and peer must be loopback. CORS is disabled. `GET /health` is unauthenticated HTTP liveness, not provider readiness.

| Method and path | Input / result |
| --- | --- |
| `GET /v1/info` | Product, API version, configured provider, execution mode and storage path |
| `GET /v1/projects` | Registered projects |
| `POST /v1/projects` | `{name,path,requestId}`; register existing absolute directory; 201 |
| `PATCH /v1/projects/:id` | `{name}`; renamed project |
| `GET /v1/projects/:id/sessions` | Session summaries, including unavailable state |
| `POST /v1/projects/:id/sessions` | `{name,requestId}`; idempotent creation; snapshot with 201 |
| `GET /v1/sessions/:id` | Status, configuration, recent history, partial output and live tools |
| `PATCH /v1/sessions/:id` | `{name}`; renamed snapshot |
| `PATCH /v1/sessions/:id/config` | `{model,thinkingLevel?,instructions?}`; idle-only saved configuration |
| `POST /v1/sessions/:id/messages` | `{text,requestId}`; 202 with submission `{id}` |
| `GET /v1/sessions/:id/history?before=entryId` | Up to 50 entries projected into messages; older cursor |
| `POST /v1/sessions/:id/cancel` | Cancel owned work; 204 after cancellation joins |
| `POST /v1/sessions/:id/resume` | Explicit recovery; 204 means scheduling enabled, not completed |
| `DELETE /v1/sessions/:id` | Delete idle session history; retryable 204; source files retained |
| `GET /v1/provider` | Supported provider, configured status, models and thinking levels |
| `POST /v1/provider/login` | `{method:"oauth"}`; start provider authorization; 202 |
| `GET /v1/provider/login` | Current login events and prompt, or null |
| `POST /v1/provider/login/answer` | `{loginId,promptId,value}`; answer current prompt; 204 |
| `DELETE /v1/provider/login` | Cancel login; 204 |
| `DELETE /v1/provider/credentials` | Remove saved credentials; ambient credentials unaffected |

Typical client sequence:

```text
Register/select project → create/select session → save model/configuration
→ submit text with stable requestId → poll snapshot → paginate history
```

Retry an uncertain submission with exactly the same text and ID. A reused ID with different text
returns 409. Configuration and admission are separate operations; retry must not reconfigure an
already admitted run. 202 confirms admission, not a successful answer.

| Status | Meaning |
| --- | --- |
| `idle` | No active tasks; consult outcome rather than assuming success |
| `running` | Pi has active work |
| `interrupted` | Saved work exists; scheduler is paused pending explicit action |
| `blocked` | Work cannot proceed; cancellation/provider/server diagnosis may be needed |
| `unavailable` | Runtime could not be read; explicit Resume can attempt reopening |

Malformed input returns 400; missing identity 404; lifecycle/identity conflict 409; access failures
401/403; internal failure returns sanitized 500. The web proxy reports transport failure as 502.
A failed API request does not establish whether an external tool effect happened.

## Evidence and limits

`test/mvp.test.ts` covers project/session identity, native tools, pagination, admission/deletion
races, exclusive execution, cancellation, close/reopen, SIGKILL, and failed-Harness recovery.
Tests use temporary data and faux inference, never personal credentials or paid requests.
Live ChatGPT authorization/inference, power loss, supported backups and exhaustive external-effect
replay remain unverified. The feature inventory records scope; tests prove their specific scenarios.
