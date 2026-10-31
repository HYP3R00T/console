# Give each session its own Pi harness and saved configuration

Historical scope: The visible session hierarchy is superseded by one hidden runtime per project; see the [current hierarchy](../architecture.md#product-hierarchy).

Status: proposed; implemented on the task branch for maintainer review.

## Context

The maintainer approved multiple sessions and model/thinking controls in a sidebar–conversation–inspector layout inspired by durable-pi. Console remains a single-machine application. Existing credentials and conversation history must survive the change.

## Decision

Keep a small Console-owned SQLite session catalog. Give each new named session its own Pi harness and `sessions/<uuid>/conversation.sqlite`, initially containing one main conversation. Use stable session IDs for selection and request-ID scopes for retries. Register the previous root database as the `default` session without moving or rewriting its transcript.

Persist model and thinking level in Pi's conversation configuration, independently of sending messages. Derive allowed levels with Pi's capability helper, reject unsupported values, and reject configuration changes while that session has unfinished work. The browser shows saved settings and requires edits to be saved before sending.

Keep the current Next.js/Fastify stack and polling. The sidebar selects sessions, the center displays the conversation and composer, and the inspector edits functional settings. No remote hub, placeholder tabs, or demo job system is introduced.

## Alternatives

- One harness with several root-level conversations shares a recovery/storage boundary across unrelated sessions.
- One application database containing Pi's internal tables couples Console's schema to the harness implementation.
- Recreating or moving the existing database adds migration risk without providing user value.

## Consequences

Sessions can run independently and retain separate history and settings; credentials remain shared per machine. A failed session is reported individually. Each opened session retains its harness until backend shutdown; cache eviction and large-scale concurrency remain future work.

Restart still requires explicit resume per session. Rollback to the previous development version leaves new session files/catalog intact but exposes only its original root conversation. Workspace tools, forks, rename/archive/delete operations, remote machines, and advanced harness policies are outside this slice.
