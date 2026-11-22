# Upgrade Console’s Pi packages

- **Author:** Rajesh
- **Status:** Implemented and rehearsed. Live cutover pending.
- **Date:** 2026-11-22

## Overview

Upgrade Console’s six Earendil dependencies together from 1.5.0 to the latest stable Pi release, verified as [1.6.0](https://github.com/earendil-works/pi/releases/tag/v1.6.0) on November 22, 2026. The [server manifest](../../packages/server/package.json) pins `chord`, `pi-ai`, `pi-codemode`, `pi-durable`, `pi-env`, and `pi-mcp` to 1.5.0. Treat their version change and any required Console API adaptations as one upgrade.

## The problem

Pi Durable 1.6.0 changes persisted tool and generation task formats. An older Harness can block tasks written by the new release, so a package downgrade alone is insufficient after the new backend has written to its databases. Console also patches missing JSON import attributes in Pi AI’s published provider model declarations. The upgrade must check whether 1.6.0 still has that omission. [Durable changelog](https://github.com/earendil-works/pi/blob/v1.6.0/packages/durable/CHANGELOG.md) · [Console patch configuration](../../pnpm-workspace.yaml)

The upgraded backend starts with fresh databases. The owner can re-register projects and start new conversations. Prior conversation history stays with the saved 1.5.0 installation. Console can stay closed to new work until verification passes.

## Goals

- Resolve all six direct Earendil dependencies at the same stable release and verify the resulting lockfile and Pi AI patch disposition.
- Adapt Console to the target package APIs and pass the [repository’s application checks](../development.md#verification).
- Verify that the upgraded backend initializes fresh state, creates a project and conversation, and resumes pending Durable work after a restart on the same version.
- Rehearse launching the retained 1.5.0 installation with its own dependencies and matching pre-upgrade state before reopening Console to new work.

## Non-goals

- Migrating existing projects, conversations, or pending Durable tasks into the fresh databases, or supporting older Console or Pi Durable APIs.
- Upgrading unrelated dependencies or adding classifier routing, signal-driven approvals, or other product features.
- Executing the cutover as part of design approval.

## Technical plan

### Upgrade the packages together

Before installing candidate dependencies or building 1.6.0, retain a separately runnable 1.5.0 Console installation. Keep its source revision, frozen lockfile, built application, and complete installed runtime dependency tree, including workspace packages and the targets of dependency symlinks. Record its launch directory and command. The server runs unbundled JavaScript and the build replaces `dist`, so the retained installation must resolve its dependencies independently of the candidate workspace. [Server build and start scripts](../../packages/server/package.json)

Pin all six direct Earendil dependencies to 1.6.0 in the server manifest and resolve the workspace lockfile as one change. Review the resolved Earendil dependency tree for stale copies and attribute any other lockfile changes to the upgrade. After building the candidate, verify resolution from each installation’s built server entrypoint before opening live state. Record the resolved package paths and installed versions for all six packages. The retained entrypoint must resolve all six at 1.5.0 with real paths inside its own installation. The candidate entrypoint must resolve all six at 1.6.0 from the candidate installation.

Inspect the unpatched, published Pi AI 1.6.0 package under `dist/providers/*.models.d.ts` and typecheck with Console’s configured compiler. Regenerate the patch only if those declarations still omit a required `with { type: "json" }` attribute on a JSON import. Limit any replacement patch to adding the missing attributes. If the published declarations already include the required attributes, drop the 1.5.0 patch without a replacement. Track unrelated compiler errors separately. Verify the resulting configuration with a clean frozen install and typecheck. [Package manifest](../../packages/server/package.json) · [Patch configuration](../../pnpm-workspace.yaml)

Check the Console call sites against the new Durable task, hook, and tool contracts, including parked tool results and Code Mode namespaces. Use the [MCP and managed extension checks](#mcp-and-managed-extension-checks) before enabling integrations. Permanent conversation deletion uses raw Durable SQLite tables and currently accepts only 1.5.0. Verify the [purge storage invariants](#purge-storage-invariants) on a fresh 1.6.0 database before updating the guard. [Durable release notes](https://github.com/earendil-works/pi/blob/v1.6.0/packages/durable/CHANGELOG.md)

### MCP and managed extension checks

- **Flat, opt-in MCP discovery.** Use the fixture in [coding-tools.test.ts](../../packages/server/test/coding-tools.test.ts) to verify that connecting an MCP server leaves its tools unavailable to conversations that have not opted in, including siblings of an opted-in conversation. Once enabled, the fixture tool starts deferred and `tool_search` finds it by its flat name, `mcp__fixture__echo`. Verify a direct call, persistence of discovery after restart, and a structured result through a Code Mode call to `tools.mcp__fixture__echo` when Code Mode is enabled. Verify the existing access and tool selection checks still apply. Keep the flat names and current exposure policy with 1.6.0. [MCP registration](../../packages/server/src/harnesses/mcp-tools.ts) · [Code Mode configuration](../../packages/server/src/harnesses/advanced-tools.ts)
- **Managed bundle compatibility.** Run [managed-extensions.test.ts](../../packages/server/test/managed-extensions.test.ts) on the candidate. In the disposable rehearsal, check each owner bundle intended for cutover against the candidate’s actual 1.6.0 registry. Check that the configured identity and revision are installed, the expected tools and tasks are registered, and extension status reports no load problem. Exercise a representative call with a controlled workspace and external services. A healthy backend alone does not prove a bundle loaded. Record the outcome for each bundle and keep failing or unverified bundles disabled. Confirm the selected bundles’ status again during live acceptance. [Managed extension startup and status](../../packages/server/src/harnesses/managed-extensions.ts)
- **Parked tools.** Identify bundles that can return a parked tool result. Before enabling one in live cutover, require a separate owner-accepted display check in the disposable environment. Trigger the bundle’s applicable `sleeping` or `waiting` state and verify the execution display distinguishes it from active work. Release the wait through the test trigger and verify that the same call advances and shows its result. Keep a bundle that parks tools disabled until this check passes. The current execution display labels non-pending calls as running, so record any required display change separately from the package upgrade. [Execution display](../../packages/web/src/components/sessions/execution-status.tsx) · [Durable release notes](https://github.com/earendil-works/pi/blob/v1.6.0/packages/durable/CHANGELOG.md)

### Purge storage invariants

Build a disposable database through the installed 1.6.0 Harness and populate it through the current APIs. Include a target conversation with owned descendants, an independently owned fork that depends on its history, an unrelated conversation, and records for a completed tool call, pending work, and conversation and task documents. Close the Harness before inspecting or modifying the database.

Before changing the version guard, add a regression assertion for the actual layout used by purge. Inspect `sqlite_schema` and the generated records and verify that the adapter’s queries identify the expected rows. Record these invariants in the test:

- `conversations` stores ownership in `owner_conversation_id` and `owner_task_id`. Its `record` JSON stores the parent reference at `$.parent.conversationId`. The owned-conversation traversal finds the target and its owned descendants, and the fork query finds dependent conversations outside that set.
- `tasks` uses `status != 'terminal'` for work that blocks purge. `submissions` uses `queued` and `placed` for submissions that block purge. The existing predicates identify the corresponding fixture records independently.
- `entries`, `tasks`, and `submissions` use `conversation_id`. `documents.scope_kind` and `documents.owner_id` identify conversation- and task-scoped documents, and `document_revisions.document_id` identifies their revisions. The existing selectors exclude unrelated rows. Record any relevant constraints or triggers that affect the deletes.
- Structural conversation rows and the allocated IDs in `record_ids` must survive erasure. Verify that the layout supports reducing a purged conversation record to its ID and clearing its ownership without removing the row or any ID allocation.

Keep the existing SQL and update the exact version guard and adapter comment only after those checks pass. If an invariant differs, leave the guard at 1.5.0, record the mismatch and the SQL it affects, and return to design review. Before accepting the guard change, run the 1.6.0 purge regressions against the guarded adapter. Assert separately that a dependent fork, a nonterminal task, and a queued or placed submission cause refusal without changing stored rows. After an eligible purge, verify the intended history and document revisions are erased, unrelated conversations retain their history, and the surviving structural rows and exact allocated ID set match expectations. [Purge adapter](../../packages/server/src/harnesses/purge-conversation.ts) · [Fresh storage test](../../packages/server/test/durable-storage.test.ts) · [Archive behavior tests](../../packages/server/test/conversation-archives.test.ts)

### Fresh database cutover

Console resolves live state under the backend user’s `~/.local/share/console`. The directory contains the project and Harness indexes, per-session SQLite databases, provider credentials, optional access grants, and owner configuration files. It also contains standalone workspace files under `sessions/workspaces`. An empty state directory creates a new Console installation identity. Clients may need to pair again, and providers need to be configured before a real model can run. [Backend entrypoint](../../packages/server/src/main.ts) · [Harness runtime](../../packages/server/src/harnesses/runtime.ts) · [Provider store](../../packages/server/src/providers/store.ts)

1. With the owner coordinating the maintenance window, close user and webhook admission. Before stopping the old backend, complete the [fresh-state inventory](#fresh-state-inventory) and record pending jobs and scheduled workflows, including which schedules could become due during the maintenance window. Record the launcher, its restart settings, and the active, saved 1.5.0, and quarantined 1.6.0 state paths in cutover notes outside those directories. Hold all automatic start and restart paths for both builds, including after a host restart, and verify that only the operator can launch a backend during the swap. Stop the old backend and verify it has exited before moving state. Console’s instance lock lives inside the state directory, so moving it can allow an unexpected launcher to lock a replacement directory. [Startup and shutdown hooks](../../packages/server/src/app.ts) · [Instance lock](../../packages/server/src/storage/instance-lock.ts)
2. Record the original directory’s filesystem identity, such as its device and inode, before the first move. Verify the saved and quarantine destinations are unused sibling paths on the same filesystem. Rename the entire old state directory to the saved path and verify its recorded identity and owner-only access. Keep SQLite sidecars, configuration, and standalone workspaces together. Project repositories and Git worktrees outside that directory stay in place. Record which saved state directory belongs to the retained 1.5.0 installation.
3. Create a fresh owner-only state directory at the normal path and record its filesystem identity before starting the candidate. Bootstrap with loopback access for verification. The owner recreates the required provider and access configuration and checks any HTTP, MCP, execution, or managed extension configuration before enabling it. Keep old SQLite files in the saved directory. [HTTP configuration](../../packages/server/src/access/configuration.ts)
4. Start the 1.6.0 candidate against the fresh state with normal admission still closed. Use a disposable project and controlled test workloads. Apply and verify the final settings through the [cutover access gate](#cutover-access-gate). Reopen normal admission only after verification passes and the owner accepts the cutover.

### Fresh-state inventory

The old state directory remains available with the retained 1.5.0 installation. The active 1.6.0 installation starts without its records and standalone files. Before shutdown, the owner records which items to recreate, retire, or recover. Record names, paths, and decisions in the cutover notes. Keep credentials and access tokens in their existing secure storage. [Backend entrypoint](../../packages/server/src/main.ts) · [Harness index](../../packages/server/src/harnesses/store.ts)

| What leaves the active installation | Owner action |
| --- | --- |
| Project registrations, conversation history, and pending Harness work | Re-register the projects still needed and start new conversations. The saved installation holds the prior histories and pending work for rollback. Existing project checkouts and Git worktrees outside the state directory stay on disk. |
| Workflow definitions and versions, run and approval history, cron state, and admission records | Decide which workflows to recreate or retire. Recreate the required definitions under their new project registrations and enable their schedules deliberately. Old runs, approvals, and scheduler state stay with the saved installation. |
| Console’s project-scoped webhook routing and delivery deduplication records | Existing subscriptions stay configured in GitHub. Retire each subscription or update its delivery URL to use the new project ID. Decide whether to discard or explicitly reconcile missed or redelivered events before enabling delivery, since the fresh installation has no prior delivery receipts. |
| Standalone workspace files under `sessions/workspaces` | Identify files worth keeping. Copy those files from the saved directory to a new workspace or another owner-selected location. Keep the original files with the rollback state and omit the old SQLite files from the recovery copy. |
| Provider credentials, client access grants, and owner configuration | Reconnect the required providers, pair clients as needed, and review the HTTP, MCP, execution, and managed extension configuration that the new installation needs. |

Record the disposition of each applicable item before reopening normal traffic. Keep retired schedules and webhook bindings disabled. [Workflow storage](../../packages/server/src/workflows/service.ts) · [Project-scoped webhook route](../../packages/server/src/workflows/routes.ts) · [Standalone workspace path](../../packages/server/src/harnesses/runtime.ts)

### Cutover access gate

Before stopping 1.5.0, record and activate the deployment controls that block normal user traffic and GitHub webhook deliveries on every exposed route, including any direct route to the backend. Keep a separate operator-only verification path. These controls must stay in effect across backend stops and starts, through candidate verification and any rollback. GitHub webhook requests are exempt from Console’s bearer authentication and use a separate signature check. Closing the user path does not establish that the webhook path is closed. [Client access checks](../../packages/server/src/access/service.ts) · [GitHub webhook route](../../packages/server/src/workflows/routes.ts)

Verify the two barriers separately before the swap and again after starting the selected backend under its final settings. From the normal client route, send a request with valid test access where authentication is enabled. From the normal webhook route, send a controlled test delivery with a valid signature where GitHub hooks are configured. Verify from the deployment control’s response or logs that it blocked each request before forwarding it to Console. Use a disposable target for webhook checks so a failed barrier cannot trigger a live workflow. If either path is unconfigured, verify that it has no exposed route. Keep admission closed if either check fails.

After loopback verification, apply the intended `http.json` and restart the backend with both barriers still active. Console reads the listener, allowed origins, and authentication settings at startup. From the operator-only path, confirm the intended bind address and port, browser access from an allowed origin, and rejection of an unlisted origin. Where authentication is enabled, verify pairing and a successful authenticated request, then confirm an unauthenticated request to a protected route receives a denial from Console. Record results for these checks and both admission barriers before the owner reopens traffic. [Backend startup](../../packages/server/src/main.ts) · [HTTP settings](../../packages/server/src/access/configuration.ts)

Pair a candidate client in a disposable browser context or at a separate verification origin. Keep the old paired context for rollback. Console stores one token per backend origin within a browser context, so pairing the candidate at the same origin in the old context can replace the token needed after restoration. If that token was replaced, record that the client must re-pair against 1.5.0 and verify access before reopening traffic. [Browser token storage](../../packages/web/src/lib/backend/auth.ts)

### Verification before reopening

Run the three gates in order. Record evidence for each gate before advancing.

#### Candidate checks

- Run `pnpm install --frozen-lockfile`, repository checks, `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build` with the configured toolchain. Inspect the lockfile and patch diff and verify both launchers’ resolved dependency versions. Require `CONSOLE_REQUIRE_SANDBOX_TEST=1 pnpm test` to pass on a runner with Bubblewrap and permitted unprivileged namespaces before advancing to the disposable rehearsal. Record the passing run and any checks that were unavailable locally. [Development and verification](../development.md#verification)
- Extend the crash recovery case in [coding-tools.test.ts](../../packages/server/test/coding-tools.test.ts). Use a faux provider and stop at a deterministic barrier during the next model request after a tool result commits. Before terminating the child, capture the submission ID and prove that the active Pi-owned `pi.generation` v3 task for that submission has a persisted nonterminal record. After termination, check that the record exists in SQLite before reopening with 1.6.0. Allow recovery to retry the interrupted request, then verify that the original submission settles, its final answer appears once, and the already committed tool result appears once without repeating the tool. [Durable task versions](https://github.com/earendil-works/pi/blob/v1.6.0/packages/durable/CHANGELOG.md)
- Run the fixture tests in the [MCP and managed extension checks](#mcp-and-managed-extension-checks). Use [background-jobs.test.ts](../../packages/server/test/background-jobs.test.ts) for scheduled-job recovery and scoped cancellation, and [workflows.test.ts](../../packages/server/test/workflows.test.ts) for an approval that remains pending across restart until an explicit decision. Exercise local tools, remote execution, and provider configuration through their existing suites. Keep these checks separate from recovery of the Pi-owned task. Use simulated providers and controlled external actions.

#### Disposable rehearsal

- Use the built 1.6.0 candidate and retained 1.5.0 launcher in the disposable environment specified in implementation step 5. Exercise the start and restart hold, interrupt the directory swap, and verify recovery to the recorded state identity.
- Complete a fresh-state cutover with controlled integrations. Verify the access gate and run a representative tool-using conversation from project registration through conversation reopening. Record the [managed bundle and parked tool checks](#mcp-and-managed-extension-checks) for the bundles the owner intends to enable.
- Force a cutover failure and rehearse restoring disposable 1.5.0 state with a pending job and a due workflow. Exercise both owner decisions and confirm that startup waits for authorization. After authorization, verify the restored installation identity, access, and a known project and conversation. Observe the resumed work with external actions isolated and inbound traffic still closed.

#### Live acceptance

- Once candidate checks and rehearsal pass, use the fresh-state inventory during the owner’s maintenance window. With normal admission still closed, confirm that the candidate is running against the recorded fresh state and completes one disposable end-to-end conversation.
- Apply the [cutover access gate](#cutover-access-gate) to the final configuration and confirm the approved bundle selection and load status. Record both barrier results and the owner’s acceptance before reopening traffic. On failure, follow [rollback](#rollback) while admission stays closed.

### Rollback

If a gate fails before normal admission reopens, keep traffic blocked and stop the 1.6.0 backend if it started. Confirm that the retained launcher still resolves all six 1.5.0 packages from its independent installation before letting it open the saved state.

For a failed or interrupted swap, recheck that automatic startup is held and both backends have exited before moving either directory. Use the recorded filesystem identities and actual paths to identify the last completed step. Apply the matching recovery action and record its result before starting either build.

| State found after interruption | Recovery action |
| --- | --- |
| The original 1.5.0 directory is still at the active path, or has already been restored there. | Leave it in place and follow the resumption decision below before starting 1.5.0. |
| The original directory is at the saved path and the active path is absent. | Rename the saved directory back to the active path and verify its identity. |
| The original directory is at the saved path and the active path holds the identified 1.6.0 directory, whether or not the candidate started. | Move the candidate directory to the unused quarantine path, verify that move, then restore the original directory to the active path and verify its identity. |
| A directory cannot be identified or a planned destination is already occupied. | Keep both builds stopped and leave the directories in place until the owner verifies their identities and records an unused destination as needed. |

Before starting the restored 1.5.0 backend, review the saved inventory with the owner, including workflows that became due during the outage. Record the owner’s explicit decision on whether pending jobs and scheduled workflows may resume. Starting the backend resumes eligible Harness work and starts the workflow scheduler even while inbound traffic stays closed. If the owner withholds authorization or needs to inspect state first, keep the live backend stopped. Use a disposable copy with external actions isolated for any startup needed to inspect it. Restoring the databases leaves effects already made to repositories or external services in place. [Startup hooks](../../packages/server/src/app.ts) · [Workflow scheduler](../../packages/server/src/workflows/service.ts)

Once the owner authorizes resumption, start the retained installation with its recorded launch command and restored HTTP settings. Repeat the [cutover access gate](#cutover-access-gate) with both barriers active. Verify that the preserved client context can access the restored installation, or re-pair if its token was replaced. Confirm an existing project and conversation before restoring traffic. Keep the retained installation and saved live state together until the owner explicitly releases them. The pre-upgrade snapshot is the rollback point. Once normal admission resumes, restoring it would omit subsequent work, so any later rollback requires an explicit decision about that state.

Restore automatic startup only after the owner accepts the cutover or the rollback checks pass. Verify that the launcher points to the selected installation and its matching active state before releasing the restart hold.

## Alternatives considered

### Upgrade the packages independently

Separate upgrades would make failures easier to attribute to an individual package. They would also introduce intermediate version combinations to verify. Durable 1.6.0 declares exact 1.6.0 dependencies on Chord, Pi AI, and Pi Code Mode, so a staged upgrade could install both versions while Console still imports the older versions directly. [Durable package manifest](https://github.com/earendil-works/pi/blob/v1.6.0/packages/durable/package.json)

Upgrading the six direct dependencies together gives Console one release set to verify.

### Migrate the existing state in place

An in-place upgrade would preserve project registrations, conversation history, configuration, and pending work. It would require testing the old database layouts and pending task states against the new runtime. A failure after the new build writes state would still require restoring the pre-upgrade copy.

The owner can re-register the projects they need and start new conversations. A fresh-state cutover avoids migrating existing databases and supporting older APIs.

### Roll back the build alone

Switching builds without restoring state would keep the data written during verification and shorten the rollback procedure. Durable 1.6.0 changes the persisted task versions, and an older Harness can block those tasks. With admission closed during verification, restoring the saved state also avoids the need to reconcile newly accepted user work. [Durable 1.6.0 changelog](https://github.com/earendil-works/pi/blob/v1.6.0/packages/durable/CHANGELOG.md)

**Ruled out by storage compatibility.** Roll back to the matching build and state together.

## Detailed implementation plan

1. **Retain the rollback installation and update dependency resolution.** Follow [the package upgrade prerequisites](#upgrade-the-packages-together) to retain the independently runnable 1.5.0 installation before touching the candidate installation. Set the six direct versions to exactly 1.6.0 in [the server manifest](../../packages/server/package.json) and regenerate [the workspace lockfile](../../pnpm-lock.yaml) with the repository’s pnpm version. Remove the obsolete Pi AI 1.5.0 patch entry from [the workspace configuration](../../pnpm-workspace.yaml) and remove `patches/@earendil-works__pi-ai@1.5.0.patch`. Inspect and typecheck the unpatched published 1.6.0 declarations. Create `patches/@earendil-works__pi-ai@1.6.0.patch` only if the published provider model declarations still lack required JSON import attributes. Add only those attributes, register the patch in the workspace configuration, and regenerate the lockfile if needed. Check the diff for six aligned direct versions, aligned Earendil transitive versions, and only resolution changes attributable to this upgrade. Preserve the Next.js patch.
2. **Adapt the runtime call sites.** In [post-run.ts](../../packages/server/src/harnesses/post-run.ts), replace `runEndTask` with `hookTask` and keep the existing after-run check and repair behavior. In [view.ts](../../packages/server/src/harnesses/view.ts), omit the projected `wakeAt` field when a sleeping task has no deadline. Review [advanced-tools.ts](../../packages/server/src/harnesses/advanced-tools.ts) and [mcp-tools.ts](../../packages/server/src/harnesses/mcp-tools.ts) against the 1.6.0 namespace and tool result contracts. Verify the [MCP and managed extension checks](#mcp-and-managed-extension-checks) and adapt the call sites only where needed to preserve that behavior. Record any additional affected call sites with the failing check that identified them.
3. **Update and verify permanent deletion.** Replace `packages/server/test/durable-migration.test.ts` with a fresh-state test at [durable-storage.test.ts](../../packages/server/test/durable-storage.test.ts) and remove `packages/server/test/fixtures/durable-1.4.0.json`. Use the fresh fixture to verify history and settings after reopening and to assert the [purge storage invariants](#purge-storage-invariants) before changing the guard in [purge-conversation.ts](../../packages/server/src/harnesses/purge-conversation.ts). Reuse [the archive tests](../../packages/server/test/conversation-archives.test.ts) for covered behavior and add missing assertions to the fresh-state test. The [execution-history tests](../../packages/server/test/execution-history.test.ts) retain independent coverage of the 50-entry live window and earlier pages.
4. **Record the upgrade and verify the candidate.** Document the [fresh-state inventory](#fresh-state-inventory), including recreating or retiring workflows, rebinding or retiring webhooks, recovering standalone files, re-registering projects, and reconnecting providers or clients as applicable. Update [coding-tools.test.ts](../../packages/server/test/coding-tools.test.ts) to verify persisted Pi task recovery and run the [candidate checks](#candidate-checks). Review the existing [provider](../../packages/server/test/providers.test.ts), [check recovery](../../packages/server/test/check-recovery.test.ts), [remote execution](../../packages/server/test/remote-execution.test.ts), and [archive](../../packages/server/test/conversation-archives.test.ts) coverage when evaluating failures.
5. **Rehearse the cutover and rollback with disposable state.** Record the retained and candidate launch directories and commands, original state path, saved state path, and candidate quarantine path. Use a disposable backend home, a reserved loopback port, synthetic 1.5.0 state with a known project and conversation, and disposable repository and worktree paths. Verify the resolved home and workspace paths before either build starts. With test credentials and controlled external services, run the [disposable rehearsal](#disposable-rehearsal). Interrupt the swap after moving the old directory but before creating the candidate directory, then recover using [the rollback table](#rollback). After that recovery, run the full swap and force a failed cutover check to exercise restoring old state with the retained launcher.
6. **Cut over during the owner’s maintenance window.** Follow [the fresh database cutover](#fresh-database-cutover) once the candidate checks and rehearsal pass. Keep both admission barriers active through [live acceptance](#live-acceptance). Record the package versions, check results, and whether the owner accepted the upgrade or restored the previous installation in this design. Update [the design sitemap](SITEMAP.md) to reflect the verified outcome.

## Implementation and verification record

- **Packages.** The six direct Earendil packages and their Earendil transitive dependencies resolve to 1.6.0. The published Pi AI declarations reproduced TS1543 under the configured compiler, so the replacement patch adds only the required JSON import attributes. A clean frozen install applied it successfully. The other lockfile changes came from the upgraded packages’ dependency and peer requirements. [Pi AI patch](../../patches/@earendil-works__pi-ai@1.6.0.patch)
- **Runtime.** Chord 1.6.0 moved `Context`, `Draft`, and `copyJson` to its `context`, `delta`, and `json` exports. Console now imports them from those paths. The post-run hook uses `hookTask`, and task views omit the wake time for signal-only sleeps. The fresh 1.6.0 SQLite layout matched the prior reviewed layout, and the purge regression passed with a version-guard change and unchanged SQL.
- **Candidate checks.** Frozen install, lint, typecheck, production build, and `CONSOLE_REQUIRE_SANDBOX_TEST=1 pnpm test` passed. The suite ran 157 server and 129 web tests with zero skips. It covered persisted generation recovery, purge, flat MCP discovery and Code Mode, and fixture managed extensions. The recurring-review test now checks cancellation after the task settles, when the provider has observed the abort.
- **Disposable rehearsal.** The retained and candidate entrypoints independently resolved their six packages at 1.5.0 and 1.6.0. Using an isolated home, a fake provider, and loopback-only listeners, the rehearsal recovered an interrupted swap, then ran a tool-using conversation on fresh 1.6.0 state and reopened its history under final authenticated settings. An induced cutover failure restored the 1.5.0 installation identity, paired access, project, and conversation. After the simulated owner authorization, the pending job completed and the due workflow reached approval while simulated user and webhook ingress remained blocked.
- **Live acceptance.** The rehearsal used synthetic credentials, projects, state, and ingress controls. Live databases and servers were untouched. Verification of the actual deployment and any owner-supplied bundles, including the display check for bundles that park tools, remains part of live cutover preparation.

*Drafted with EGM*
