# Documentation

Start here for maintained context; the repository README is the product entry point.

## System boundaries

- [Server guide](packages/server.md): current backend behavior and HTTP/runtime boundaries.
- [Web guide](packages/web.md): current browser behavior, controls and client-owned state.
- [Managed extensions](packages/server.md#managed-extensions): trusted bundle provisioning, installation and conversation selection.
- [Design index](designs/SITEMAP.md): subsystem contracts, implemented decisions and future feature designs.
- [Source coverage](designs/coverage.md): exact file ownership, scope and limitations.
- [Development](development.md): commands, tools, quality gates and server ownership rules.

## Ownership and effects

Console separates a Fastify backend that owns providers, projects and Durable runtimes from a Next.js browser client that owns presentation preferences and connections; shared contracts define configuration schemas and command metadata.

- `packages/web/src/lib/backend/connection-manager.ts:ConnectionManager` checks backend installation identity; identity is separate from bearer authentication enforced by `packages/server/src/access/service.ts:AccessService`.
- `packages/contracts/src/index.ts:settingMetadata` distinguishes browser, machine, project, session and conversation ownership; configuration updates must retain their owning scope and revision requirements.
- `packages/server/src/harnesses/service.ts:HarnessService.ensureDefault` reuses an existing project session; legacy multiple-session records remain accessible without automatic consolidation.
- `packages/server/src/workflows/service.ts:WorkflowService.start` deduplicates workflow admission; a stored request identity does not make external effects exactly once.
- `packages/web/src/lib/configuration/store.ts:parseBackup` validates browser configuration and strips imported backend identities; provider credentials and transcripts stay outside browser preference backups.
- `contracts/package.json:exports` exposes shared source; consumers own runtime validation and execution.
- `server/src/main.ts` owns backend process/storage lifetime; `web/src/lib/backend/connection-manager.ts:ConnectionManager` owns independent browser connection lifetimes.
- Server services persist SQLite records and Durable checkpoints, call model providers, execute admitted tools/checks and manage optional SSH, sandbox, MCP and extension lifetimes; see the server contract for constraints.
- Workflow GitHub actions can perform an explicitly configured and approved merge; project setup can create or clone directories, while project archival preserves source files.
- The browser requests backend metadata and event streams, stores preferences in localStorage and keeps paired access credentials separately by origin in tab-session storage.
- Setup scripts can install tools and Git hooks; ordinary documentation inspection does not require running them.

## Artifact ownership

| Artifact                  | Purpose                                                         | Maintenance                                                                                       |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Package guides            | Current observable behavior                                     | Update when behavior changes; link structural details to the owning baseline.                     |
| Subsystem baselines       | Source boundaries, interfaces and invariants                    | Keep file links and contracts synchronized with implementation.                                   |
| Feature designs           | Intent, decisions, alternatives and implementation/verification | Keep status explicit; link implemented or superseding decisions.                                  |
| Coverage index            | File-to-document map                                            | Add/remove rows with source changes and check local links.                                        |
| Audit reports             | Evidence and finding dispositions at a date                     | Archive after resolution; do not treat old line numbers/results as current validation.            |
| Drafts and scratch output | Work in progress                                                | Incorporate needed decisions into the maintained artifact; remove duplicates after incorporation. |

## Reading and retention

Load the guide, relevant baseline sections and focused design for the task; load the coverage index only to locate files or audit coverage.
The generated directory READMEs were consolidated into these baselines; route wrappers use one route table rather than a document for each intermediate directory.
Retiring those duplicates preserves their interfaces and substantive rules; coverage does not certify that every design decision or runtime path has been independently reviewed.
Keep the root README and useful human-facing guides.

## Completing a change

Record fixes in the owning document and Git diff, rather than creating another permanent document explaining that the document was fixed.
Keep unresolved findings visible; archive resolved reports with dispositions and replacement links.
Run Markdown, local-link and repository checks before an authorized documentation commit; application changes additionally require the checks in Development.
Documentation edits, a completed audit and a commit do not authorize pushing, merging or deployment.
