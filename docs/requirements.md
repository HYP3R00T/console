# Requirements

Console currently provides only a local Hello World baseline:

- Fastify: `GET /health` returns HTTP 200 and `{"status":"ok"}`.
- Next.js: `/` displays "Hello, world!" with browser-default styles.
- Server and web run independently on loopback ports 3000 and 3001.
- Both use native terminal output and require no application configuration.

The website does not connect to the server. Agent execution, projects, sessions, authentication,
persistence and remote access are not implemented. Existing data from earlier experiments is
untouched and unused. Future capabilities require separate design and implementation decisions;
the historical feature inventory is not an approved roadmap.
