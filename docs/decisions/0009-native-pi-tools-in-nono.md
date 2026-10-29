# Execute Pi coding tools inside nono

Status: accepted through the maintainer's request for usable, isolated project agents.

## Context

Conversation creation requested no filesystem access, so ordinary project tasks had no tools.
Console's compatibility tools did not expose Pi's standard coding interface. Running Pi's tools
in the backend process would give them access to provider credentials and private databases.

## Decision

Use Pi Durable's official read, write, edit, and bash implementations inside the existing nono
worker. Pass only tool arguments and a restricted sandbox-local execution bridge. Grant the fixed
installed runtime packages read-only access; retain the clean environment and private temporary
home. Adapt shell spawning to stay in the supervised process group. Keep legacy tool names for
history compatibility and never fall back to unconfined execution.

New UI conversations use project reads/writes and commands with network blocked. Existing saved
policies remain unchanged until explicitly reapplied. Include project directory metadata in prompt
context regardless of tool availability. Keep project settings separate from conversation tabs.

## Alternatives and consequences

- Host-side native tools would bypass the isolation boundary.
- A second bespoke coding implementation would duplicate Pi's editing and read behavior.
- Whole-process backend confinement would also affect inference and credential storage.

Workers still pay startup cost. This is filesystem/process/network confinement, not a virtual
machine or CPU/memory quota. Project files are readable by design; files containing secrets inside
an approved project are not automatically redacted. Native tests prove allowed operations and
outside/private-path, symlink and network denial, plus process-tree cancellation. This supersedes
the original no-shell boundary in decision 0003 while retaining its fail-closed worker design.
