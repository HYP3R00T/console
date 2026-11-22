# Remove Changesets from Console

- **Author:** Rajesh
- **Status:** Implemented
- **Date:** 2026-11-22

## Overview

Remove Changesets from Console’s repository and development toolchain. The project owner will write release notes by hand when needed. The [Pi upgrade design](pi-package-upgrade.md) remains the source for its cutover and rollback instructions.

## The problem

At the reviewed baseline, Console used [Mise](../../mise.toml) to install the Changesets CLI and exposed it through [the root package scripts](../../package.json). The three workspace packages are private, and the [checked-in CI workflow](../../.github/workflows/ci.yml) has no Changesets release step. The owner retired that process in favor of [manual release notes](../development.md#release-notes).

## Goals

- Remove the `.changeset/` directory, including its configuration and every pending entry, from the working tree. The pending entries can be discarded.
- Remove the root Changesets command and its Mise tool and lock entries so project setup no longer installs the CLI.
- Document that release notes are written by hand when needed. Reconcile the Pi upgrade design’s release-note instructions while retaining its operational cutover and rollback guidance.
- Verify that normal repository checks and build workflows still run and that current setup, CI, and contributor instructions no longer rely on Changesets.

## Non-goals

- Generating a changelog or transferring pending Changesets entries to a new release-notes file.
- Bumping package versions, publishing a release, or introducing replacement release automation.
- Uninstalling tooling from the owner’s machine or changing live Console state.

## Technical plan

### Remove the integration

Remove the reviewed `.changeset/` directory, the `changeset` script in the root package manifest, and the `npm:@changesets/cli` entries in both Mise files. The owner approved discarding the directory’s configuration and all 77 pending notes. Remove those files and update the contributor and Pi upgrade instructions together so current instructions refer only to tools and files available in the checkout. The [setup script](../../scripts/setup.sh) already uses the project tool list from Mise.

### Write release notes by hand

Replace the Changesets section in the [development guide](../development.md#release-notes) with a short release-notes policy. The owner writes notes by hand when a release or deployment needs them and chooses their destination at that time.

The [Pi upgrade design](pi-package-upgrade.md#detailed-implementation-plan) remains the source for the fresh-state inventory, verification evidence, cutover, and rollback.

### Verification

Verify that the cleanup removes the reviewed paths and CLI entries, that current instructions work with the remaining toolchain, and that the application checks still pass. Keep ordinary local test results, strict sandbox coverage, and observed CI results distinct in the verification record. [Development verification](../development.md#verification)

## Alternatives considered

### Keep Changesets available for occasional releases

Keep the configuration and pending entries and run the CLI only when preparing a release. This preserves automatic version bumps and changelog generation, but the project would still carry the tool or require contributors to obtain it separately.

### Turn the pending entries into a one-time changelog

Collect the existing entries in one document before deleting the directory. This would preserve a browsable summary of prior work, but it would take editorial work to decide which entries belong together and which still describe current behavior. The owner confirmed that the pending entries do not need to carry forward. The [Pi upgrade design](pi-package-upgrade.md) already contains its cutover and rollback instructions.

### Add a replacement release-note workflow

Provide a standing changelog, template, or generator to give future releases a consistent format. That would introduce another convention or tool to maintain. Hand-written notes can be created for a specific release or deployment when they are needed, so the removal can proceed without selecting a format or destination today.

## Detailed implementation plan

### 1. Check the deletion boundary

Use `git ls-tree -r --name-only aeca837 -- .changeset/` to get the exact 78 approved deletion paths. The baseline is commit `aeca837f2314d845d111035ebb5598eea0d5e8b1`. Compare those paths with `git ls-files -- .changeset/`. Use `git diff aeca837 -- .changeset/` and `git status --short --untracked-files=all --ignored -- .changeset/` to check for committed, staged, or unstaged differences and for untracked or ignored files. Resolve any discrepancy before deleting affected paths. Capture the pre-change contents of both Mise files for comparison after verification.

The seven write targets outside the queue are `package.json`, `mise.toml`, `mise.lock`, `docs/development.md`, `docs/designs/pi-package-upgrade.md`, `docs/designs/remove-changesets.md`, and `docs/designs/SITEMAP.md`.

### 2. Remove the integration and update its instructions

Make these edits together before verification.

- Delete the approved `.changeset/` paths, including `.changeset/config.json` and `.changeset/pi-package-upgrade.md`.
- Delete the `changeset` script from [the root package manifest](../../package.json). Remove the `npm:@changesets/cli` declaration from [mise.toml](../../mise.toml) and its matching table from [mise.lock](../../mise.lock).
- Replace the Changesets section in [the development guide](../development.md) with a `Release notes` heading and the manual policy. Update both `../development.md#changesets` links in this design to `../development.md#release-notes` when the heading changes. Keep descriptions of the retired integration in historical tense.
- In step 4 of [the Pi upgrade plan](pi-package-upgrade.md#detailed-implementation-plan), remove only the sentence directing the reader to add `.changeset/pi-package-upgrade.md` with a patch bump for `@console/server`. Retain the fresh-state inventory, candidate checks, implementation evidence, and cutover and rollback instructions.

### 3. Verify the removal

If an active or retained Console installation shares the checkout, run checks that write dependencies or build output on an authorized isolated runner. The build recreates the server’s `dist` output. [Server scripts](../../packages/server/package.json) · [Pi installation boundary](pi-package-upgrade.md#upgrade-the-packages-together)

- Confirm `.changeset/` is absent and compare the recorded deletions with the exact 78 approved paths. Confirm the root manifest omits the `changeset` script. Search tracked, hidden, and untracked project text for `changeset`, excluding Git metadata and generated output. Review hits for commands, configuration, or links that still rely on the retired integration. Historical descriptions in this design or the review reports can name it.
- Run `tombi lint --offline mise.toml mise.lock` and inspect `mise ls --local --json` for the absence of the CLI in the repository-local tool list. Global tools on the owner’s machine are outside this check.
- Record each check separately. Run `pnpm install --frozen-lockfile`, `pnpm check` for Biome, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Run `prek run --files package.json mise.toml mise.lock docs/development.md docs/designs/pi-package-upgrade.md docs/designs/remove-changesets.md docs/designs/SITEMAP.md`, which includes the removal design even while it is untracked. Run RumDL on the four edited Markdown files and verify their local paths and heading fragments, including the sitemap entry.
- Require a passing `CONSOLE_REQUIRE_SANDBOX_TEST=1 pnpm test` on a runner with Bubblewrap and permitted unprivileged namespaces, or an observed passing CI application-checks job for the same candidate with strict sandbox coverage enabled. Record ordinary local test skips and unavailable sandbox coverage explicitly. Inspecting the checked-in workflow can confirm it has no Changesets invocation. Report a CI pass only for an observed run. [Development verification](../development.md#verification) · [CI workflow](../../.github/workflows/ci.yml)
- After the checks, compare both Mise files to the captured pre-change contents with a parsed TOML comparison or a readable text diff. When `HEAD` matches the captured contents, use `git diff --text HEAD -- mise.toml mise.lock` to account for the lockfile’s diff attribute. The only expected Mise changes are removal of the CLI declaration and table. Confirm the CI workflow, `pnpm-lock.yaml`, and `packages/server/package.json`, `packages/web/package.json`, and `packages/contracts/package.json` are unchanged by the cleanup.

### 4. Record the result

Record what ran and the outcome of each check in this design. Keep verification pending if required coverage is unavailable, unless the owner explicitly accepts the limitation. Update the status here and in the [design sitemap](SITEMAP.md) to `Implemented` after recording the verification results and any explicitly accepted limitation. Recheck the final Markdown and links after the status update.

## Implementation and verification record

- **Removal.** The 78 deleted paths exactly matched the approved inventory. The root script and the two Mise entries were removed. The repository search found references only in this design and the sitemap. The development guide documents manual release notes, and the Pi design’s cutover and rollback instructions were preserved.
- **Tool configuration.** `tombi lint --offline mise.toml mise.lock` passed, and `mise ls --local --json` omitted the CLI. The text and parsed comparisons confirmed that the two CLI entries were the only Mise changes. The CI workflow, pnpm lockfile, and three workspace package manifests matched the baseline.
- **Repository checks.** The scoped Prek run, `pnpm check`, RumDL, and local path and heading checks passed.
- **Frozen install.** A fresh `pnpm install --frozen-lockfile --offline` passed with pinned pnpm 12.18.0 and a copied package store in an isolated source copy.
- **Typecheck.** `pnpm typecheck` passed for server and web in the isolated copy.
- **Ordinary tests.** `pnpm test` passed in the isolated copy with 157 server and 129 web tests and zero skips.
- **Strict sandbox tests.** The Bubblewrap namespace probe and `CONSOLE_REQUIRE_SANDBOX_TEST=1 pnpm test` passed with the same counts and zero skips. Both successful test runs used disposable fixture directories outside the Git repository rooted at `/tmp` on this host.
- **Build.** `pnpm build` passed for server and web in the isolated copy.
- **CI and live state.** The checked-in workflow contains no Changesets invocation. No hosted CI run was observed. Verification used temporary files and fixture databases, leaving live Console servers and databases untouched.

*Drafted with EGM*
