# Persistent machine settings and project lifecycle

Execution-policy note (2026-10-30): sandbox-related decisions below are superseded by
[direct host execution](../architecture.md#direct-host-execution). Other decisions remain historical context.

Status: accepted through the maintainer's request for editable machines, cloning, setup, and deletion.

## Context

Machine configuration was read-only, project registration required manual setup, and navigation
lacked lifecycle controls. Agent setup needs command execution without granting personal-home access.

## Decision

Persist machine names, project roots, and model preferences in the catalog. Use public HTTPS
GitHub cloning with explicit status and retry. Registration does not execute setup scripts.

Offer opt-in setup commands through the existing nono boundary, with a disposable home,
process-group cancellation, time/output bounds, and no automatic replay. This extends the
file/HTTP-only boundary in [ADR 0003](0003-configurable-nono-workers.md).

Use recoverable Trash for projects, sessions, and conversations, preserving files and databases.
Separate Home summaries from the resizable machine/project/session conversation surface.

## Alternatives considered

Environment-only names/defaults prevent ordinary UI configuration. Unrestricted host shell
execution exposes credentials and personal files. Permanent deletion makes accidental loss harder
to recover. Automatic repository setup would execute unreviewed scripts on registration.

## Consequences

Preferences survive sessions and restarts; setup can run explicitly within project grants.
Trash retains storage until a future retention policy is designed. Commands can consume resources
within their timeout; hard CPU/memory quotas are not provided. Private repository credentials,
hook editors, and machine provisioning need separate designs.
