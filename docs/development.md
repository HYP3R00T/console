# Development

Run these commands from the repository root. [AGENTS.md](../AGENTS.md) defines agent permissions, including control of the owner's development servers.

## Mise

Mise installs the repository's shared tools and exposes development tasks. See [mise.toml](../mise.toml) for tool requirements and task definitions and [mise.lock](../mise.lock) for resolved versions. Use a Mise-activated shell or prefix a tool command with `mise exec --` to use configured tools.

- `bash scripts/setup.sh` trusts the repository's Mise configuration and installs its tools. Review the configuration before trusting it.
- `mise install`: install the configured tools.
- `mise run dev:server`: run the backend on `127.0.0.1:3000`.
- `mise run dev:web`: run the website on `127.0.0.1:3001` in a separate terminal.

The configured enter hook runs [scripts/enter_project.sh](../scripts/enter_project.sh). It can install the Commitizen CLI when `uv` is available and replace missing or non-Prek Git hooks. Setup and hook installation change local tooling and are separate from running checks.

## pnpm

pnpm manages workspace dependencies and runs the scripts defined in the [root](../package.json), [server](../packages/server/package.json) and [web](../packages/web/package.json) manifests. Use the configured Node.js version, which must satisfy the server's engine requirement.

- `pnpm install --frozen-lockfile`: install dependencies without changing the lockfile.
- `pnpm typecheck`: check application types.
- `pnpm test`: run application tests.
- `pnpm build`: build both applications for production.
- `pnpm --filter @console/server start`: run the built backend.
- `pnpm --filter @console/web start`: run the built website.

Type checks can generate Next.js route types. Tests use temporary state, and builds write application output. The production start commands require the corresponding build and available ports.

Sandbox integration tests require Linux Bubblewrap and permitted unprivileged namespaces; unsupported local hosts report explicit skips.
CI installs Bubblewrap and replaces Ubuntu's `bwrap` AppArmor profile with a user-namespace allowance scoped to `/usr/bin/bwrap` on the disposable runner; using the same profile name avoids competing executable attachments.
It verifies namespace creation and sets `CONSOLE_REQUIRE_SANDBOX_TEST=1`, so unavailable sandbox support fails the job instead of skipping coverage; host-wide AppArmor restrictions remain enabled.

## Biome

Biome formats and lints JS/TS, JSON, CSS and GraphQL using `biome.json`.

- `pnpm check:fix`: format code and apply safe lint fixes.
- `pnpm check`: report remaining issues without changing files.

Run after code edits and review any automatic fixes for unrelated changes.

## RumDL

RumDL checks and formats Markdown using `rumdl.toml`.

- `rumdl check docs/development.md`: check a Markdown file; substitute the paths you edited.
- `rumdl fmt docs/development.md`: apply Markdown fixes.

The Markdown commit hook runs in check mode. Inspect formatter changes for unrelated rewrites.

## Prek

Prek runs repository checks and Git hooks configured in `.pre-commit-config.yaml`. These include Biome, RumDL, ShellCheck, file hygiene checks and Commitizen commit-message validation.

- `prek install`: install the configured Git hooks. The Mise enter hook normally handles this.
- `prek run --all-files`: run repository checks on all tracked files.
- `prek run --files docs/development.md`: check explicit paths, including untracked files; substitute each new file's path.

Hooks may rewrite code, whitespace and line endings. Inspect edits and rerun failed checks. Installed hooks run automatically on commit, including Commitizen validation of the Conventional Commit message. Application verification runs separately.

## ShellCheck

ShellCheck analyzes shell scripts for errors without executing them. It also runs through Prek for matching files.

- `shellcheck scripts/enter_project.sh`: check a shell script; substitute the edited path.

## Tombi

Tombi formats and lints TOML. Mise installs it for direct use.

- `tombi lint`: lint TOML files across the repository.
- `tombi format`: format TOML files across the repository.

Both commands discover TOML files recursively, including `mise.toml` and `rumdl.toml`. Run Tombi directly for linting and formatting. The Git hook checks TOML syntax.

## Changesets

Changesets records package changes and prepares version/changelog updates for the private workspace packages.

- `pnpm changeset`: record a user-visible package change and choose its bump level.
- `pnpm changeset status`: inspect pending changes relative to `main`.
- `pnpm changeset version`: apply pending version/changelog updates.

The [Changesets configuration](../.changeset/config.json) uses `main` as its base and enables versioning for private packages. Documentation-only changes need no entry. Run version preparation only for an authorized release. Changesets does not commit or publish automatically.

## Verification

- Run repository checks before reporting work ready. Check new files by explicit path since `--all-files` only sees tracked files.
- For documentation changes, run RumDL and check local link paths and heading fragments, including design index entries.
- For application changes, also run `pnpm check`, `pnpm typecheck`, `pnpm test` and `pnpm build`. The [CI workflow](../.github/workflows/ci.yml) runs repository and application checks in separate jobs.
- Report failures and unavailable checks. Keep verification evidence scoped to what actually ran.

## Documentation and designs

Use the [design sitemap](designs/SITEMAP.md) to find feature decisions. Check the relevant source and targeted tests for current behavior.

Keep prose concise and use one source line per paragraph, including list items. Preserve structural line breaks in tables, code blocks and quotations.

1. For a change that needs a design, describe the problem, acceptance criteria and boundaries in a stable `docs/designs/<feature>.md` file.
2. Record architecture, considered alternatives, decisions and rationale, consequences and verification criteria in the owning design. Identify the affected files and plan reviewable implementation phases. Link to the owning decisions from dependent designs.
3. Use fresh-context review for consequential or uncertain designs. Resolve material findings in the design and record approval explicitly. Keep proposal, approval and implementation status distinct in the design and the sitemap.
4. Run the relevant checks during implementation. Record verified behavior and accepted deviations in the owning design, and synchronize its status in the sitemap. Keep a superseded design at its stable path and link its replacement.

Keep unresolved audit findings visible and record their dispositions before archiving resolved reports. Incorporate lasting decisions from working drafts into their owning designs.
