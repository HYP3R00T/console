# Native Pi agent hierarchy and runtime controls

Status: accepted through the maintainer's request for the Durable Pi navigation and agent controls.

## Context

A flat session list and conversation dropdown hid forks, child agents, tool capabilities, and runtime
state. Mandatory names added friction. Reference behavior is described in
[Durable Pi](https://github.com/disler/durable-pi#the-durable-agent-network).

## Decision

Keep Console's machine → project → session → conversation hierarchy. Render native Pi ancestry
and task ownership beneath conversations. Use Pi IDs for agent labels and catalog identities for
session numbers. Names remain editable; creation does not require them.

Use Pi registry/inspection APIs for real tool definitions and task state. Keep sandbox authority in
the existing policy; the inspector can narrow selected tools. Use native forks and task-owned child
conversations instead of simulating either through prompt copying or unrelated sessions.

Persist shared machine state separately with revision conflicts and per-tool replay receipts.
Keep network and inspector independently collapsible through shadcn panels, preserving drafts.

## Alternatives considered

Copying the demo's complete tool set would also copy its host-shell and example-workflow assumptions.
A flat list loses ancestry. Frontend-only state loses changes on restart. Blind JSON replacement
can overwrite another session's updates. Arbitrary browser-supplied extensions execute trusted code.

## Consequences

Agents and users can inspect capabilities and coordinate through saved state. Separate conversations
share files; they do not imply checkout isolation. Shared state spans projects and is unsuitable for
secrets. Installed extension tool selection is available; arbitrary code/hook installation and the
demo's sample job catalog remain separate work. Runtime task visibility does not promise those jobs.
