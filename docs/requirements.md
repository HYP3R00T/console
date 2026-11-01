# Console requirements

The current baseline is intentionally limited to a health endpoint and a Hello World website.
Product functionality will be designed and delivered in separate increments.

## Implemented scope

- A Fastify server listening on `127.0.0.1:3000`.
- `GET /health` returns HTTP 200 and `{"status":"ok"}`.
- A Next.js website on `127.0.0.1:3001`, displaying "Hello, world!" at `/`.
- Type checking, a server HTTP smoke test, builds and repository quality checks.

There is no connection between the website and server. There are no application components,
providers, agent runtime, projects, sessions, storage, authentication or proxy routes.
No environment file, environment-variable configuration, CLI options or data directory is required.

## Reset boundary

Earlier application code, tests, UI dependencies and obsolete design records have been removed.
Existing user data outside the source tree is untouched; this baseline neither reads nor migrates it.
Historical feature IDs remain in the feature inventory for reference, not as an approved roadmap.
