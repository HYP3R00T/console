# Local Pi integration with machine credentials and one conversation

Status: proposed; implemented on the task branch for maintainer review.

The one-conversation storage choice below is extended by [session-owned harnesses](0002-session-owned-harnesses.md). Provider credential ownership is unchanged.

## Context

Console needs a small working foundation before workspace agents and a larger dashboard. The maintainer requested Pi's provider mechanisms in the UI, including ChatGPT subscription access, configured per machine. Console user authentication and deployment are deferred.

## Decision

Use pinned Pi AI and Pi Durable packages inside Fastify. Expose Pi's supported provider methods through a generic prompt/notification bridge. Store one credential per provider and a stable installation identity in an owner-only SQLite database. Keep credentials on the backend and delegate OAuth and refresh to Pi.

Use a separate Pi-owned SQLite database for one tool-free conversation. Next.js displays history and committed partial answers through a same-origin proxy with polling. Fastify owns execution. Require explicit resume after backend restart, and retain request IDs to deduplicate submissions.

## Alternatives

- A provider-specific UI duplicates Pi's authentication logic and ages independently.
- A CLI-only login is smaller but fails the requested browser configuration workflow.
- An in-memory harness cannot demonstrate persistent history or recovery.
- Multiple sessions, tools, workers, and streaming subscriptions would expand the first change before proving the integration.

## Consequences

This proves provider configuration and conversational lifecycle, not autonomous development or safe external-effect replay. One backend owns each data directory. Saved credentials are plaintext, protected by filesystem permissions; encryption/keyring integration is deferred. Environment credentials remain available after deleting a saved credential. Local browser mutation protection is not authentication for remote deployment.

The UI exposes methods present in Pi 1.4.0; provider terms and account entitlements still apply. Scripted-provider tests cover the mechanism without signing into or spending from a real account. Maintainer acceptance and live subscription verification remain outstanding.
