---
"@console/server": patch
"@console/web": patch
---

# Organize server and web code by responsibility

Group backend code into HTTP, model, platform, connection, project, session, runtime and sandbox
domains. Separate Harness lifecycle from configuration, input and read projections while retaining
its shared mutation queue. Split chat request/layout state and panel composition into focused web
domains, remove an unused renderer, and update source guides, imports and sandbox worker paths.
Routes, storage, permissions and interface behavior remain unchanged.
