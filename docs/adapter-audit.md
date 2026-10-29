# Backend adapter simplification audit

Date: 2026-10-30. Baseline: `322d3a1`, Pi packages 1.4.0, nono CLI 0.80.0.
Status: baseline audit with implementation update below. No dependency upgrade.
The [feature inventory](features.md) remains the implementation checklist.

## Direct-host decision supersedes sandbox recommendations

The maintainer subsequently requested complete nono removal without compatibility adapters.
The runtime now installs CodingTools directly and supplies NodeExecutionEnv to Harness. Policy
validation, subprocess supervision, worker protocol, supplemental directory/HTTP adapters and
sandbox UI/toolchain installation are deleted. Project Markdown loading moved to `projects/`.
Receipts, native agent inheritance and the web-owned connection registry remain. See the
[execution design](architecture.md#direct-host-execution) and [feature inventory](features.md)
for current behavior. All nono references and recommendations below are historical analysis.

## Earlier implementation update (before complete removal)

The maintainer explicitly waived legacy compatibility after reviewing this audit. The cleanup
removes the backend hub and duplicate read_file/write_file/run_command registrations/worker
operations, without aliases or automatic saved-state migration. Database files are left untouched.
The resulting server source is 29 files; exact source-line counts are reported with the verified
diff rather than projected savings. The full 59-test suite, types/build/hooks and compiled-worker
read/write/edit/bash/resource/private-path checks passed. The existing development backend
still exposed its old tool registry during the browser check; it must be restarted before
the new live registry can be verified. The agent did not restart user development servers.
Canonical Pi tool lists, child AgentDoc inheritance and permitted-tool calculations replace
redundant assembly; repeated project path checks and obsolete prompt migration are consolidated.
Supplemental directory/HTTP/resource tools, sandbox supervision and retry receipts remain.

The baseline analysis below explains the trade-offs; its staged compatibility migration is
superseded by the maintainer's decision. Current delivered boundaries live in the feature inventory.

## Original recommendation (superseded)

Keep one web-owned machine registry, Pi's native coding tools inside the existing restricted
worker, and small Console services for product metadata and policies. Remove duplicate behavior
before adding new abstractions. Do not replace working boundaries with a large RPC environment,
generic repository framework, or new dependency just to make the entry point shorter.

The clearest complete-module retirement is the backend's old connection registry/proxy:
229 source lines, plus its import/registration. It has no current browser caller, but is still a
documented API and has tests. Its removal needs an explicit compatibility decision. Absence of
in-repository callers does not prove that no external client or saved registry uses it.

Other opportunities are partial reductions. No evidence supports treating all 5,168 lines as
unnecessary, or promising a few-hundred-line backend with today's functionality intact.

## Where the lines are

Physical source lines include comments and blanks, excluding tests, dependencies and builds.
These groups are disjoint and sum to 5,168.

| Responsibility | Lines | Interpretation |
| --- | ---: | --- |
| Startup, HTTP composition and errors | 347 | HTTP/authentication and service assembly |
| Providers and credentials | 297 | Login interaction and persistent credential adapter |
| Machine configuration/settings | 176 | Console product configuration |
| Projects | 461 | Directory catalog, clone lifecycle, validation and routes |
| Session catalog and HTTP routes/schemas | 923 | Console identities, lifecycle and validated API |
| Pi runtime adapters/extensions | 1,479 | Lifecycle, configuration, admission, projections and coordination |
| Sandbox adapters/resources | 1,256 | Process supervision, tool bridge, grants and resource loading |
| Legacy backend connection registry | 229 | Competing implementation eligible for retirement |

Removing the 229-line module removes roughly 4.4% of server source, before related cleanup.
The remaining reductions must be measured from actual diffs; whole files that contain some
duplication are not entirely deletable.

## Adapter-by-adapter decisions

Paths below are relative to `packages/server/src`. A decision to retain an adapter does not
mean every line inside it is optimal.

| Adapter | Local source lines | What upstream supplies | Decision |
| --- | ---: | --- | --- |
| `main.ts`, `app.ts`, `http/*` | 347 | Fastify routing, schemas and lifecycle hooks | Keep access/error boundaries and composition; remove repeated schema/type declarations where one schema can own both. Moving provider routes alone saves no behavior. |
| `platform/*` | 176 | Node filesystem/OS facilities | Keep storage resolution, machine defaults and private-path rules; Pi does not supply Console machine settings. |
| `models/credentials.ts` | 83 | Pi's `CredentialStore` interface and an in-memory implementation | Keep persistence, serialized modifications and exclusive ownership. An in-memory replacement would lose saved credentials. |
| `models/providers.ts` | 214 | Pi owns provider catalogs, OAuth/API-key login, logout and refresh | Keep the browser prompt/answer adapter. Do not reimplement OAuth or add another provider catalog. |
| `projects/workspaces.ts` | 461 | Node filesystem and Git operations, not a Console project service | Keep registration, clone/retry and source-preserving deletion. Consolidate repeated path canonicalization/overlap checks, retaining checks before creation and after symlink resolution. |
| `sessions/catalog.ts` | 394 | Pi owns per-session storage and execution | Keep cross-project catalog, names, defaults, request identities and Trash. Pi storage does not replace this product catalog. |
| `sessions/routes.ts`, `conversation-routes.ts`, `schemas.ts` | 529 | Fastify runtime validation; Pi AI re-exports TypeBox `Type` and `Static` | Keep validation; derive TypeScript bodies from shared schemas incrementally. Do not replace explicit route handlers with a generic dispatcher. |
| `runtime/session.ts`, `context.ts`, `documents.ts` | 412 | Native Harness, conversations, transactions and forks | Keep ownership/serialization and Console documents. Reduce expensive repeated full summaries used only to find request metadata. Rename misleading `openConversation` when touching its callers. |
| `runtime/configuration.ts`, `tools.ts` | 208 | Native `configure`, registry and resolved agent choices | Keep sandbox restrictions and idle guards. Share the duplicated permitted-tool calculation without making extension enablement depend on the old extension selection. |
| `runtime/input.ts` | 246 | Native submission, abort, compact and reset | Keep HTTP retry identity, explicit-resume policy, withdrawal checks and resource expansion. Native compact/reset are not drop-in replacements for the receipt-bearing operations. |
| `runtime/view.ts` | 303 | Native history/context, documents, `viewState`, `watch` and events | Keep the bounded browser DTO and history pagination. A raw native view does not have the same response shape or pagination; changing transport is separate work. |
| `runtime/coordination.ts`, `plan.ts` | 261 | Native task ownership, inherited agent state and documents | Remove redundant child-agent field copying; keep explicit tool restrictions, sandbox inheritance, replay identity, shared-state CAS/receipts and plan semantics. |
| `runtime/purge.ts` | 49 | No matching public conversation-purge operation found in pinned exports/interfaces | Keep the narrow version-guarded adapter while permanent deletion remains a product feature. Do not remove the version guard to make upgrades easier. |
| `sandbox/policy.ts`, `runner.ts` | 458 | nono enforces filesystem/network/process restrictions | Keep the policy-to-manifest adapter and supervisor: clean environment, process lifetime, cancellation, output bounds, scratch cleanup and no unrestricted fallback. |
| `sandbox/tools.ts`, `worker.ts`, `pi-tools.ts` | 604 | Pi's coding-tool factories and `NodeExecutionEnv` | Retire duplicate coding implementations in phases; retain the worker boundary and genuinely additional tools. Use `CodingTools` as the canonical factory list instead of assembling it in two places. |
| `sandbox/resources.ts` | 194 | No matching bounded project Markdown/skill/template loader found in pinned Durable/AI exports | Keep project resource discovery/expansion and trust limits. Pi CLI's loader is a different host API and is not an automatic replacement. |
| `connections/backends.ts` | 229 | Current web registry already supplies the product connection path | Retire the backend hub API after deciding compatibility; preserve its database file without opening or deleting it. |

## Retirement 1: one machine registry

Evidence:

- `connections/backends.ts` at baseline `322d3a1` owned `/v1/backends` and its proxy.
- [Web registry](../packages/web/src/lib/server/machine-store.ts) independently owns current connections.
- The [browser API helper](../packages/web/src/lib/api.ts) translates its internal `/backends`
  shorthand to `/api/machines`; it does not call the backend hub.
- The web proxy rejects forwarding `backends` routes; [tests](../packages/server/test/machine-store.test.ts)
  explicitly cover that rejection.
- [Hierarchy tests](../packages/server/test/hierarchy.test.ts) still use the old backend hub as
  their transport; [lifecycle tests](../packages/server/test/lifecycle.test.ts) also assert its behavior.

Implementation after the compatibility decision:

1. Remove the backend hub import/registration and `connections/backends.ts`.
2. Keep web registry, remote bearer authentication, handshake and SSH behavior intact.
3. Preserve `backends.sqlite` on disk; do not silently import remote credentials into the web registry.
4. Rewrite remote hierarchy coverage through the supported web registry/proxy or direct backend
   calls, preserving the existing project/session/fork/state assertions. Add an explicit old-route
   retirement assertion rather than discarding all the tests that happened to use that transport.
5. Correct current API guides and add a breaking-contract release note. Historical ADRs remain
   historical. Do not add an indefinite second compatibility server or permanent 410 shim.

The internal browser shorthand can be renamed separately for clarity; it is not a second registry
and must not be deleted by a blanket search for `backends`.

## Retirement 2: one canonical coding-tool family

Three custom names overlap with native tools, but are not byte-for-byte aliases:

| Existing tool | Candidate | Difference that must be handled |
| --- | --- | --- |
| `read_file` | Pi `read` | Custom strict 64 KiB text read versus native bounded/paged read and diagnostics. |
| `write_file` | Pi `write` | Native write also creates file parents; preserve permission and input bounds deliberately. |
| `run_command` | Pi `bash` | Custom stdout/stderr JSON versus native combined output and structured result; schemas and errors differ. |
| `list_directory` | Retain | Native `read` opens regular files, not directories. Using bash would require command authority. |
| `create_directory` | Retain | Native write creates parents for a file, not an arbitrary empty directory. Using bash broadens required authority. |
| `fetch_url` | Retain | No equivalent native coding tool; network-enabled, command-disabled policies still need this capability. |

Target: `read`, `write`, `edit`, `bash`, plus directory listing/creation, HTTP fetch and project-resource
loading. That is one coding implementation family with explicit supplemental capabilities.

Saved tool names exist in Pi agent documents and potentially unfinished task records, not only
in displayed history. Removing a tool definition can leave saved work without its implementation.
This audit did not inspect personal databases or prove those names are unused.

Recommended transition:

1. Offer native tools for new selections; identify deprecated names already selected by saved agents.
2. Retain execution of legacy task names and historical transcript rendering during transition.
3. Move only idle configurations through an explicit, idempotent migration; preserve enabled tools,
   grants, extension identity and replay policy. Never rewrite old history or in-flight calls.
4. Implement thin aliases only after testing the output/schema differences above; do not keep a
   complete second implementation just to support old names.
5. Remove dispatch branches only when no supported saved work requires them. If breaking saved
   compatibility is acceptable instead, make that an explicit product decision with migration guidance.

No precise net-line saving is claimed before implementing and measuring that transition.

## Retire copied settings, not coordination guarantees

Pinned Pi's `createAgent()` already copies the parent's full `AgentDoc` for a task-owned child.
A disposable faux-provider probe confirmed equality without Console copying any fields.

In `runtime/coordination.ts`, model, thinking level, instructions, cwd and extension copying can
therefore shrink. Keep the explicit tool allowlist/recursive-delegation exclusion and the separate
`SandboxDoc` copy. Console documents do not automatically acquire Pi AgentDoc inheritance.
Ownerless additional roots do not have this automatic parent relationship; their Main-default
copying in `runtime/session.ts` is not the same redundancy.

The permitted-tool list is also duplicated between extension toggling and `offeredTools()`.
Extract only the underlying grant/ownership calculation; extension toggling must calculate using
the proposed extension selection, not accidentally intersect with the old selection.

## Apparent shortcuts that are not equivalent

- `root.compact(instructions, context)` creates a task but accepts no request ID. Console creates
  the task and its receipt atomically. Calling compact first and saving a receipt afterwards adds
  a duplicate-work window and can repeat a paid summary.
- `root.reset(handoff, context)` submits a write without Console's request ID. Keep the native
  request-identified `submit({type: "write", requestId, entry})` path.
- `root.watch()` and `viewState()` expose raw active entries/documents. They do not replace the
  current 50-entry browser history contract, privacy filtering and Console fields unchanged.
- `NodeExecutionEnv` alone supplies filesystem/execution capabilities; it does not apply nono.
- The default Node shell executor detaches its child process group. Simply deleting our shell
  adapter would lose the supervisor's existing descendant-cancellation mechanism.
- Applying an SDK sandbox to Fastify itself would also constrain provider/credential operations.
  An SDK would still need a separate worker for the current permissions model.
- A full `ExecutionEnv` over IPC needs file readers, directory readers, paths, errors, output,
  cancellation and process lifecycle. It is not proven smaller than the current tool-level worker.

## nono SDK verification

The [official TypeScript page](https://nono.sh/typescript-sdk) advertises `nono-ts` and irreversible
process confinement. The actual published metadata was checked on the audit date:

```text
pnpm view nono-ts@latest version repository optionalDependencies engines --json
  version: 0.3.0
  optional Linux dependency: nono-ts-linux-x64-gnu@0.3.0
pnpm view nono-ts-linux-x64-gnu@0.3.0 version --json
  ERR_PNPM_FETCH_404
```

The old repository URL now redirects to the active `nolabs-ai/nono` repository. Describing that
repository as currently archived is inaccurate; missing Linux distribution is the verified blocker.
The [current security model](https://github.com/nolabs-ai/nono/blob/main/docs/cli/internals/security-model.mdx)
is supporting context, not proof of compatibility with Console's pinned CLI. Installed `nono wrap
--help` confirms support for the capability manifest and exec behavior already used by Console.
No SDK package was installed and no kernel policy was applied to the backend process.

## Evidence and implementation order

Primary pinned evidence is the installed 1.4.0 package, resolved through the existing lockfile:

- `pi-durable/dist/tools/index.d.ts`, `read.js`, `write.js`, `bash.d.ts`.
- `pi-durable/dist/harness/types.d.ts`, `harness.js`, `agent.js`, `view.d.ts`.
- `pi-durable/dist/env/node.d.ts`, `node.js`.
- `pi-ai/dist/index.d.ts`, `auth/credential-store.d.ts`.

Audit experiments used faux inference/in-memory storage and disposable nono fixtures. They passed:
task-owned child AgentDoc inheritance, native write parent creation, and native read rejection of
a directory. They are narrow equivalence probes, not proof that a complete migration is ready.
No personal database, live provider credential or running development server was changed.

Recommended delivery sequence:

1. Remove redundant native-tool factory lists, child-setting copies and permission calculations;
   preserve all contracts and add focused regression coverage.
2. Retire the old backend hub after the explicit API compatibility decision.
3. Establish native coding tools as canonical and migrate supported legacy selections/tasks.
4. Deduplicate schema/type definitions and repeated project path logic only where the net result
   is easier to trace. Keep separate business validation and kernel enforcement.

Each implementation should measure net source lines, preserve the feature inventory's stable IDs,
and run the repository's types/tests/build/hooks plus relevant sandbox and saved-state cases.
No new transport, execution engine, crash-recovery project or package upgrade is proposed here.
