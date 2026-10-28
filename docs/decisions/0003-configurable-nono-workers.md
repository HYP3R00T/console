# Enforce user-configured policies in separate nono workers

Status: proposed; implemented for maintainer review.

## Context

The maintainer requested configurable isolation with conservative defaults. Pi's local execution environment is not an OS sandbox, and its QuickJS code-mode sandbox does not confine host-side tools. Restrictions must not apply to Fastify or its provider credentials.

## Decision

Pin nono 0.80.0 through mise and invoke its maintained CLI from TypeScript. The linked TypeScript binding is archived, and the published `nono-ts@0.3.0` lacks its Linux native package. Do not ship that unusable dependency or its unrelated documentation dependency tree.

Persist a per-session sandbox document in Pi. Tools start disabled. Explicit enablement grants workspace reads, optional additional read/write directories, and blocked or unrestricted network. Reject grants covering private Console data/environment; reject writable grants covering the Console source and trusted launchers.

Use a fresh credential-free process for each read, write, or HTTP GET. A fully resolved manifest grants only user directories plus fixed read-only runtime prerequisites. Keep manifests inside protected Console storage. Apply nono before execing Node; do not apply a process-wide irreversible sandbox to the backend. Fail closed on activation or operation errors.

## Alternatives

- In-process SDK confinement affects the backend and its existing threads and currently has an unusable Linux npm distribution.
- Working-directory checks or command allowlists alone do not enforce kernel filesystem/network boundaries.
- A long-lived worker adds lifecycle and policy-replacement machinery before it is needed.

## Consequences

Every tool call pays process startup cost, in exchange for a small enforcement boundary and straightforward policy replacement. Users save policies explicitly while idle. Writes and network GET do not automatically replay; reads can. No shell is enabled. Policies cannot rewrite their enforcement or service credentials.

Native Linux tests verify allowed and denied paths, symlink escapes, writes, TCP/UDP blocking with positive controls, and actual Pi calls. Other hosts must apply successfully or refuse execution. Domain filtering, advanced nono profiles, resource ceilings, credential proxying, and remote/multi-user deployment remain separate work.
