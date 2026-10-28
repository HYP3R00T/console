# Backend hub, workspace identities, and Pi conversations

Status: accepted through the maintainer's request to implement configuration for all four levels.

## Context

The previous UI exposed only local machine information and one conversation per session.
Console needs backend → project/workspace → session → conversation configuration, with the
same application shell across pages. Existing local history must remain available.

## Decision

Use the local Fastify service as a hub with a private SQLite connection registry. Forward
allowlisted requests to registered origins with tokens injected server-side, as in Durable Pi.
Require HTTPS or loopback HTTP, reject redirects, and authenticate remotely exposed backends.
Keep credentials out of registry responses and browser storage.

Store workspace identities in the session catalog. A workspace registers or explicitly creates
a directory on its backend; registration does not grant tools. Sessions optionally bind to it,
retaining legacy unassigned sessions. Keep one Pi Harness/database per session and create
additional conversations through Pi's own API, with metadata committed in Pi documents.

## Consequences

The browser switches execution targets without receiving saved backend secrets. Connections
have trusted operator authority; team accounts and per-user authorization are separate work.
Conversations have independent transcripts and settings but share files. Resume starts the
session scheduler. The local hub must be available to reach registered backends; SSH tunnel
management is external. Removing a connection does not delete remote data.
