# Development

Run these commands from the repository root. [AGENTS.md](../AGENTS.md) defines working rules and permissions.

## Mise

Mise installs the repository's shared tools and exposes development tasks. Tool versions and tasks are defined in `mise.toml` and `mise.lock`.

- `mise install`: install the configured tools.
- `mise run dev:server`: run the backend on `127.0.0.1:3000`.
- `mise run dev:web`: run the website on `127.0.0.1:3001` in a separate terminal.

**Important:** The owner runs the development servers. Agents must not start, stop or restart them without permission.

## pnpm

pnpm manages workspace dependencies and application scripts. Root scripts run checks across both packages; package scripts define each application's commands.

- `pnpm install --frozen-lockfile`: install dependencies without changing the lockfile.
- `pnpm typecheck`: check application types.
- `pnpm test`: run application tests.
- `pnpm build`: build both applications for production.
- `pnpm --filter @console/server start`: run the built backend.
- `pnpm --filter @console/web start`: run the built website.

**Important:** Application changes require type checks, tests and a production build. Production start commands require a completed build and must not replace the owner's running development processes.

Sandbox integration tests require Linux Bubblewrap and permitted unprivileged namespaces; unsupported local hosts report explicit skips.
CI installs Bubblewrap, verifies namespace creation and sets `CONSOLE_REQUIRE_SANDBOX_TEST=1`, so unavailable sandbox support fails the job instead of skipping coverage.

## Biome

Biome formats and lints JS/TS, JSON, CSS and GraphQL using `biome.json`.

- `pnpm check:fix`: format code and apply safe lint fixes.
- `pnpm check`: report remaining issues without changing files.

**Important:** Run during development after code edits, not just at commit time. Review generated edits and preserve unrelated work. Biome does not replace type checks, tests or builds.

## RumDL

RumDL checks and formats Markdown using `rumdl.toml`.

- `rumdl check docs/development.md`: check a Markdown file; substitute the paths you edited.
- `rumdl fmt docs/development.md`: apply Markdown fixes.

**Important:** Keep one source line per paragraph. Inspect formatting changes; avoid unrelated rewrites and oversized table padding. The Markdown commit hook checks files but does not format them.

## Prek

Prek runs repository checks and Git hooks configured in `.pre-commit-config.yaml`. These include Biome, RumDL, ShellCheck, file hygiene checks and Commitizen commit-message validation.

- `prek install`: install the configured Git hooks; normally handled by the Mise enter hook.
- `prek run --all-files`: check all tracked files during development.
- `prek run --files docs/development.md`: check explicit paths, including untracked files; substitute each new file's path.

**Important:**

- Run repository checks before reporting work ready. New files need explicit-path checks; no staging is required. Documentation-only work also needs local-link checks.
- Installed pre-commit and commit-msg hooks trigger automatically on an authorized commit. They do not run application type checks, tests or builds.
- Hooks may rewrite code, whitespace and line endings. Inspect edits and rerun failed checks. Never bypass hooks or report skipped checks as passed.

## ShellCheck

ShellCheck analyzes shell scripts for errors without executing them. It also runs through Prek for matching files.

- `shellcheck scripts/enter_project.sh`: check a shell script; substitute the edited path.

## Tombi

Tombi formats and lints TOML. Mise installs it for direct use.

- `tombi lint`: lint TOML files across the repository.
- `tombi format`: format TOML files across the repository.

**Important:** Run from the repository root. Both commands discover TOML files recursively, including `mise.toml` and `rumdl.toml`. Tombi is not a configured Git hook; the pre-commit TOML check validates syntax only.

## Changesets

Changesets records package changes and prepares version/changelog updates for the private workspace packages.

- `pnpm changeset`: record a user-visible package change and choose its bump level.
- `pnpm changeset status`: inspect pending changes relative to `main`.
- `pnpm changeset version`: apply pending version/changelog updates.

**Important:** Documentation-only changes do not need an entry. Run version preparation only for an authorized release. Changesets does not commit or publish automatically; publishing and deployment are not configured.
