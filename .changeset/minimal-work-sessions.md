---
"@console/server": minor
"@console/web": minor
---

# Minimal local work sessions

Reduce Console to local existing-directory projects and independent single-conversation work sessions.
Replace advanced APIs and machine navigation with a minimal project/session client, serialize lifecycle
operations, enforce one executing session per project, and retain explicit recovery and retry identity.
Earlier histories remain on disk; the MVP starts in a fresh storage namespace without compatibility routes.

Remove environment-file loading and application environment variables. The standalone backend starts
with built-in defaults and optional command-line arguments; the local website uses its fixed backend.
