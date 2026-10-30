# Console requirements

Status: local providers, persistent sessions, model controls, projects, forks and subagents are implemented. Pi Durable native tools execute directly on the host under the backend account. There is no filesystem, network or credential confinement; a project sets the working directory only. The maintainer explicitly removed nono and all access presets to study the minimal Durable backend.

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

Begin with one user, one local backend, a web client, and manually submitted work in an existing
workspace. Prove this path before adding remote hosts, additional clients, or automatic triggers.
The current integration provides one durable runtime per project and configurable conversations. Users create, select and reopen conversations, save model/thinking settings, and select installed tools. Native read/write/edit/bash run through NodeExecutionEnv in the backend process environment. Project paths are starting directories, not access boundaries. Native history forks and task-owned subagents are implemented.

Machine settings persist a readable name, default project directory, and model defaults. Projects can register directories or clone public GitHub repositories. Conversations use native Pi IDs for default names and can be renamed. Native forks and delegated child agents appear beneath their parent. Explicit project memory, separate operator-managed machine state, active-task inspection, tool selection, and installed extension controls are available. Sessions and conversations have recoverable deletion; project files and databases are retained. Home shows an overview; Chat provides a collapsible, resizable machine/project/conversation sidebar with a visible drag grip and remembered width, plus the conversation and optional details split. The project runtime stays hidden. Each machine has a persistent Default project for unassigned conversations, with an independent working directory. Conversation controls use expandable sections with project/machine settings kept separate; Settings is a full page for machine defaults, providers, and model preferences. Conversation switching must retain the current view until uncached data is ready and show cached visits without a welcome/loading flash. Thinking controls must follow the selected model's Pi-reported capabilities, hiding for off-only models and exposing every supported tier. The composer shows the selected model and thinking level together, with a backend-estimated context usage ring, and shows delivery choices only during running work. Composer model/thinking choices update local client drafts and apply only on Send; polling must not overwrite unsent choices. Other editors keep their explicit Save actions.

Connection onboarding is explicit: the web app can start with no machine, validates a server's
identity/API before saving a connection, and supports disconnect/reconnect without stopping work
or erasing backend data. A running local backend is never auto-enrolled. An explicit loopback check can fill its address.
Disconnected machines retain recent address/name metadata for reconnection; tokens are cleared.
Managed SSH connections use existing trusted keys and forward to an already-running remote server. Extension controls select
actual installed Pi extensions, including prompt sections/hooks.

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

The [Console feature inventory](features.md) tracks implemented, partial, missing and deferred
capabilities across the whole product, including execution authority and the requested Pi expansion.
[Pi integration scope](pi-capabilities.md) records the compatibility boundary. Inventory status
is not complete verification or authorization to implement deferred work. Steering and queued follow-ups,
withdrawal, usage/context inspection, manual compaction, and reset with an optional handoff are
implemented. Restart still requires explicit Resume; new input must not implicitly resume saved work.
Project Markdown instructions, discoverable skills and parameterized templates are also integrated
inside the saved workspace policy. Existing Pi CLI plugins/config files need not load unchanged;
Console provides equivalent features on its Durable runtime.

Code-change review and durable approvals,
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

## Unified workspace and model clarity

Chat, settings and machine connection management share the persistent machine tree and resizable
workspace. Settings and Add machine replace the center pane; Home is no longer a separate dashboard.
Returning to chat on the same machine preserves unsent text and model/thinking drafts. Settings
identifies the selected machine through cards, then separates model-menu choices, providers and
machine defaults. Provider credentials and defaults remain machine-owned; model-menu favorites
remain shared by this web app. Changing machines may discard unsent client state.

Both composer and settings group models under their provider names. Settings expands provider
catalogs and exposes context capacity and supported thinking levels. The composer control fits its
label. Off is selectable only when Pi reports support; required-thinking models explain its absence.
The frontend cannot supply a model missing from the machine's catalog; see the
[installed catalog audit](model-catalog-audit.md) for the unresolved CLI/package Terra discrepancy.
