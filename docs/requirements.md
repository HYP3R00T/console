# Console requirements

Status: working product baseline for review. Local provider settings, named persistent sessions, and model/thinking controls are implemented. Each session has one conversation; tools remain disabled until the user enables a sandbox policy. Workspace agent workflows remain planned.

This document records what Console is intended to do and why. [Architecture](architecture.md)
describes how we intend to provide it, including choices that remain unresolved. Requirements
below are targets, not claims of existing behavior or automatic approval to implement every feature.

## Purpose and user

Console provides one interface for viewing and controlling AI agent work across project
workspaces and, eventually, multiple machines. Its initial user is the maintainer working
on personal software projects.

The useful outcome is to delegate a bounded development task, leave the interface, and return
to inspect progress, review evidence, or continue the same work. Console should make that work
understandable and controllable without requiring continuous supervision.

## Product model

- A **machine/backend** identifies where execution and project files live.
- A **workspace** identifies an approved project directory on that machine.
- A **session** is a named, persistent working context users can reopen.
- A **conversation** contains agent interactions; a session starts with a main conversation.
- A **run** is an execution attempt within that context, with its own status and result.

These are product concepts, not a finalized database schema. Forks and subagents can extend
the conversation model later. Separate conversations do not automatically isolate filesystem edits.

## Initial delivery boundary

Begin with one user, one local backend, a web client, and manually submitted work in an existing
workspace. Prove this path before adding remote hosts, additional clients, or automatic triggers.
The current integration proves isolated, named sessions and configurable model conversations. Users can create, select, and reopen sessions and save model/thinking settings. An optional sandbox policy selects a readable workspace, explicit read/write directories, and blocked/unrestricted network access. Shell execution and forks remain planned.

## Required target behavior

- **REQ-1 — Workspace selection:** users can identify the backend and workspace in which work
  will execute. Selecting a workspace does not implicitly copy files to another machine.
- **REQ-2 — Session navigation:** users can create, name, list, and reopen sessions without
  remembering opaque identifiers. Reopening selects existing work rather than creating a duplicate.
- **REQ-3 — Assignment and visibility:** users can submit instructions and inspect agent output,
  tool activity, results, errors, and execution status. Unknown or disconnected state must be visible.
- **REQ-4 — Client independence:** closing or disconnecting the client must not itself cancel
  backend work. Reconnecting must restore the same session without resubmitting the assignment.
- **REQ-5 — Persistence and recovery:** conversations and execution state must survive client
  disconnects. Recovery after backend interruption must have explicit, tested eligibility and replay
  rules; it must not silently restart cancelled work or blindly repeat an uncertain external action.
- **REQ-6 — Explicit controls:** cancellation, completion, archiving, and deletion must remain
  distinct. Exact controls included in the first implementation must be settled in its issue.
- **REQ-7 — Bounded authority:** runs execute within the selected workspace and configured tools,
  permissions, and limits. Starting an assignment does not imply authority to merge, deploy, or publish.
- **REQ-8 — Reviewable results:** users can distinguish the agent's completion claim from recorded
  verification evidence and unresolved limitations. A completed run does not make the session disappear.

## Quality and operating constraints

- Start with a dependable single-user path; no supported concurrency or throughput target has been measured.
- Model access must be supported and verified for the chosen provider and account. Prefer the intended
  subscription-backed path where supported; do not silently switch to separately billed access.
- Persist required state outside disposable process storage. Data retention and backup/restore behavior
  must be specified before relying on Console for valuable work.
- Private local use comes first. Remote exposure requires a defined authenticated connection and access boundary.
- Meaningful success means correct task outcomes and reliable lifecycle behavior, not the number of agents running.

## Later capabilities

Remote-machine navigation, conversation forks/subagents, code-change review and durable approvals,
schedules, authenticated event triggers, CLI/TUI clients, and collaboration have been discussed.
They are extensions to refine separately, not dependencies of the initial manual workflow.

Automatic triggers should eventually submit bounded assignments through the same execution path.
Automatic initiation and permission to merge or deploy remain independent choices.

Future team access should allow multiple authenticated people to connect to the same backend.
The backend must enforce each user's access; session visibility and concurrent-control behavior
need explicit design. Selecting Next.js for the client does not implement these capabilities.

## Outside the initial scope

- Replacing source control, GitHub issues, CI/CD, or general monitoring platforms.
- A general visual workflow-programming system or domain-specific incident/news product.
- Automatic adoption of every existing agent CLI process.
- Moving live execution between machines, provisioning machines, or hosting model inference.
- Automatic production deployment or merging by default.

## Acceptance scenarios to refine into issues

1. Create a local workspace session, submit a harmless bounded task, and inspect its activity and result.
2. Close the browser during execution; reconnect to the same session without duplicate submission.
3. Restart the backend with the same persistent state; recover eligible work or show an accurate
   interrupted state, according to the agreed recovery contract.
4. Cancel work and restart the backend; verify that cancellation remains effective.
5. Make the backend unavailable; the client reports unavailable/unknown state rather than stale success.

These describe required proof, not tests already present. Delivery issues must select a coherent slice,
settle consequential choices, and identify executable checks as implementation makes them available.

## Decisions still needed

- First user workflow and proof task, including read-only versus code-editing tools.
- Expand the initial Pi Durable/SQLite conversation into workspace-bound sessions. Next.js is the client. Provider settings expose the installed Pi catalog and its supported authentication methods; subscription access is the intended OpenAI path, with no automatic change to API-key billing.
- Supported lifecycle states, recovery/replay boundaries, cancellation, retention, and concurrency limits.
- Access control, resource/cost limits, and the first deployment environment.

Keep these questions here only while they shape the product baseline; link concrete implementation
issues when they exist. GitHub remains the task/status tracker. Update this document when product
expectations change rather than copying individual issue progress into it.
