# Repository instructions

- Read [requirements](docs/requirements.md) for product intent and [architecture](docs/architecture.md) for system design. Both distinguish planned behavior from implemented functionality; update them when affected by a change.
- Inspect relevant source, configuration, and the working tree before changes; preserve unrelated work.
- Work within the requested scope. Clarify material product choices rather than inventing requirements.
- Use configured tools and existing conventions; do not weaken checks to make work pass.
- Keep documentation consistent with concrete decisions and implementation. Distinguish intended behavior from current behavior.
- For package versioning and changelog updates, read the [release workflow](docs/releases.md).
- Do not stage, commit, push, open PRs, merge, publish, deploy, or send external messages without authorization for that action.

## Git workflow

- For implementation work, use a dedicated task branch and Git worktree rather than editing the main checkout. Reuse that worktree when resuming the task; allow only one active session to write to it.
- Start new task branches from the latest remote default branch unless the task specifies another base. Do not carry unrelated uncommitted changes into the task.
- When committing is authorized, use Conventional Commits: `type(scope): description`, with an optional scope. Examples: `feat: add session list`, `fix: handle reconnect`, `docs: clarify setup`.
- Preserve other sessions' branches and worktrees. Do not delete a task's worktree or branch without authorization.

## Verification

Install shared tools with `mise install`, then run `pnpm install --frozen-lockfile`. Mise manages Node.js (`lts`), pnpm (`latest`), and Biome (`latest`) for all packages. Use pnpm for workspace dependencies and scripts. Biome handles JavaScript, TypeScript, JSON, CSS, and GraphQL checks: `pnpm check` reports issues; `pnpm check:fix` applies safe fixes. Markdown remains with RumDL.

Run from the repository root:

```bash
prek run --all-files
```

For new untracked files, also run `prek run --files` with their explicit paths; staging is not required. Inspect hook changes and report what actually ran, its results, and any limitations.
