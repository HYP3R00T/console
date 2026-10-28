# Permanent deletion of saved history

Status: accepted through the maintainer's request to erase items from Trash.

## Context

Recoverable deletion does not remove history from storage. Pi Durable 1.4 exposes immutable records
without a public per-conversation purge operation. Fork ancestry and task ownership must survive.

## Decision

Require Trash first, a second UI confirmation, and an idle owning harness. Close it before deleting
its database or running the version-guarded SQLite leaf-conversation adapter. Erase descendants first;
Main and task-owned children are erased with their session. Preserve minted IDs, machine credentials,
shared state, and source files. Purging a project registration requires deleting its sessions first.

## Consequences

Deletion is irreversible through Console and tested on disposable databases, including legacy Main.
The adapter must be reviewed on Pi upgrades. Removing a logical record does not erase backups or
promise forensic secure erasure. Shared state can retain explicitly copied facts independently.
This extends the retention boundary in [ADR 0005](0005-machine-project-lifecycle.md).
