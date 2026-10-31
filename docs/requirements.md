# Console requirements

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

- A **machine** identifies where execution and project files live.
- A **project** (workspace in the API) identifies a working directory on that machine.
- A **conversation** is the user-visible thread, with its own history, instructions and model settings.
- Each project has **one hidden session**: a Pi Harness, SQLite database and scheduler, initialized
  on first use. Sessions are implementation details, not another user-created grouping.
- A **task** is tracked runtime work: generation, a tool call, delegation or compaction.

Use **New conversation** under a project. Typing adds a message to the selected conversation.
Forks keep a history prefix; delegated conversations receive explicit instructions and return results.
All project conversations can read/update explicit project memory. Their full transcripts are not
combined automatically. Other projects have separate runtime memory. Conversations share project
files, not isolated checkouts. A project runtime interruption affects all its conversations' scheduler.

The maintainer authorized resetting experimental histories rather than migrating old session layouts.

## Initial delivery boundary

Prioritize one owner manually submitting work to a selected project through the web client.
Connections must be explicit; disconnecting must retain backend execution and data. Projects can
attach existing source directories so other development tools can use the same files.
The feature inventory records which local, remote and runtime paths are implemented.

## Required target behavior

- **REQ-1 — Workspace selection:** users can identify the backend and workspace in which work
  will execute. Selecting a workspace does not implicitly copy files to another machine.
- **REQ-2 — Conversation navigation:** users can create, name, list, and reopen conversations without
  remembering opaque identifiers. Reopening selects existing work rather than creating a duplicate.
- **REQ-3 — Assignment and visibility:** users can submit instructions and inspect agent output,
  tool activity, results, errors, and execution status. Unknown or disconnected state must be visible.
- **REQ-4 — Client independence:** closing or disconnecting the client must not itself cancel
  backend work. Reconnecting must restore the same conversation without resubmitting the assignment.
- **REQ-5 — Persistence and recovery:** conversations and execution state must survive client
  disconnects. Recovery after backend interruption must have explicit, tested eligibility and replay
  rules; it must not silently restart cancelled work or blindly repeat an uncertain external action.
- **REQ-6 — Explicit controls:** cancellation, completion, recoverable Trash and permanent
  deletion must remain distinct.
- **REQ-7 — Execution clarity:** runs start in the selected project using configured tools with
  the backend account's host authority. No sandbox or human approval gate is implemented. Starting an assignment does not imply authority to merge, deploy, or publish.
- **REQ-8 — Reviewable results:** users can distinguish the agent's completion claim from recorded
  verification evidence and unresolved limitations. A completed run does not make the session disappear.

## Quality and operating constraints

Conversation presentation must prioritize user messages and readable agent replies. Tool calls,
terminal/file output, reasoning and recorded plans remain inspectable through compact, keyboard-accessible
disclosures. Completed activity collapses by default; ongoing activity and failures remain identifiable.
Presentation must preserve stored records and show unknown/interrupted state without inventing success.
Inspecting a disclosure must not force the user back to the bottom of the transcript.
Controls must identify machine, project or conversation scope. Fork/delegation ancestry must be
readable without shifting same-level labels. Expandable navigation rows toggle when clicked and
retain their expansion choices across reloads. Conversation details toggle a resizable desktop split;
long technical controls stay collapsed until requested. Model selection uses a compact list and
supported discrete thinking levels without a search requirement. Saving a control must preserve
its position; stale background responses must not briefly roll back confirmed choices.

- Start with a dependable single-user path; no supported concurrency or throughput target has been measured.
- Model access must be supported and verified for the chosen provider and account. Prefer the intended
  subscription-backed path where supported; do not silently switch to separately billed access.
- Persist required state outside disposable process storage. Data retention and backup/restore behavior
  must be specified before relying on Console for valuable work.
- Private local use comes first. Remote exposure requires a defined authenticated connection and access boundary.
- Meaningful success means correct task outcomes and reliable lifecycle behavior, not the number of agents running.

## Later capabilities

[Features](features.md) owns statuses and remaining integration gaps. Future work includes code
review, retrievable output, durable approvals, automation/triggers and broader client access.
[Architecture](architecture.md#pi-compatibility-and-resource-boundary) defines Pi compatibility;
existing CLI plugins/configuration do not need to load unchanged. Dependency support alone does
not make a Console feature implemented.

## Outside the initial scope

- Replacing source control, GitHub issues, CI/CD, or general monitoring platforms.
- A general visual workflow-programming system or domain-specific incident/news product.
- Automatic adoption of every existing agent CLI process.
- Moving live execution between machines, provisioning machines, or hosting model inference.
- Automatic production deployment or merging by default.

## Acceptance scenarios to refine into issues

1. Create a conversation in a local project, submit a harmless bounded task, and inspect its activity and result.
2. Close the browser during execution; reconnect to the same conversation without duplicate submission.
3. Restart the backend with the same persistent state; recover eligible work or show an accurate
   interrupted state, according to the agreed recovery contract.
4. Cancel work and restart the backend; verify that cancellation remains effective.
5. Make the backend unavailable; the client reports unavailable/unknown state rather than stale success.

These describe required proof, not tests already present. Delivery issues must select a coherent slice,
settle consequential choices, and identify executable checks as implementation makes them available.

## Decisions still needed

- Supported deployment/access boundary beyond private single-owner use.
- Retention, backup/restore and abrupt-crash/external-effect recovery proof.
- Resource/cost limits, concurrency targets and policies for future executable integrations.

Keep implementation assignments and test outcomes in issues/PRs, not duplicated here.

## Interface expectations

Settings and connection management should preserve the current chat and its unsent drafts on
the same machine. Configuration must identify its scope: client preferences, machine providers
and defaults, project memory, or conversation agent settings. Model/thinking choices stay local
until Send; other editors retain explicit Save actions. Picker options must reflect Pi's actual
model capabilities and provider identity, without inventing unsupported tiers or missing models.
Current rendering, navigation and catalog limits belong in the [web guide](packages/web.md).
