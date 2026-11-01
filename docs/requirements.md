# Console requirements

Console is a trusted, single-owner interface for manually directing agent work on one machine.
The MVP is deliberately smaller than the earlier multi-machine dashboard.

## Product model

- A **project** is an existing directory registered on the backend.
- A **work session** is an independently managed effort within that project.
- Each session has one conversation, one Pi Harness, one SQLite database and one scheduler.
- Sessions retain separate histories and configuration but share their project's working files.
- Only one session may execute per project. Interrupted or unavailable siblings block new work.
- A **runtime task** is Pi's generation/tool/compaction work, not a user-facing assignment.

Projects may have multiple sessions. The backend enforces execution ownership; clients cannot
bypass it by making concurrent requests. No isolated worktrees or sandbox are provided.

## MVP outcomes

1. Register an existing project directory and create, name, list and reopen work sessions.
2. Connect the supported ChatGPT provider and save a session's model, thinking and instructions.
3. Submit text and inspect partial answers, native tool activity, outcome and paginated history.
4. Disconnect/reconnect without cancelling or resubmitting backend work.
5. Reopen storage after restart without implicitly restarting interrupted work.
6. Explicitly Resume or Cancel; cancelled work stays cancelled across restart.
7. Retry uncertain message delivery with the same identity and text, without another admission.
8. Delete an idle session's complete history while preserving project files and other sessions.
9. Show unavailable/failed/interrupted state accurately; an idle session or answer is not verification.

Native tools execute with the backend account's filesystem, network and environment authority.
There is no durable approval gate. Instructions are not enforced publication permissions.

## Deliberate exclusions

No multiple conversations, forks, subagents, shared-memory tools, plans, steering queues, manual
compaction/reset, cloning, machine registry, SSH management, MCP, plugin loader, schedules,
webhooks, automated workflows, verification jobs or fleet placement are exposed by this MVP.
Automatic Pi compaction remains enabled. Retention and supported backup/restore remain future work.

The feature inventory preserves stable IDs and records deferred capabilities; it does not authorize
implementation. Later increments should first establish managed workspaces, then collaboration,
reviewable outcomes, integrations, automation and fleet operation.

## Verification boundaries

Use disposable projects and scripted inference for automated checks. Exercise real native file
and shell tools, concurrency, process kill, recovery and cancellation. Tests cannot establish
general exactly-once external effects, power-loss durability or live provider/account entitlement.
Live subscription login and inference require the owner to complete provider authorization.
