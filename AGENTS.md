# Repository instructions

- Read [requirements](docs/requirements.md) for product intent and [architecture](docs/architecture.md) for system design. Both distinguish planned behavior from implemented functionality; update them when affected by a change.
- Inspect relevant source, configuration, and the working tree before changes; preserve unrelated work.
- Work within the requested scope. Clarify material product choices rather than inventing requirements.
- Use configured tools and existing conventions; do not weaken checks to make work pass.
- Keep documentation consistent with concrete decisions and implementation. Distinguish intended behavior from current behavior.
- Maintain [the feature inventory](docs/features.md) in the same change as feature delivery: preserve stable IDs, update status/limits/evidence, and distinguish implementation from verification. Use it as the single master checklist.
- For package versioning and changelog updates, read the [release workflow](docs/releases.md).
- For changes to `packages/server`, read the [server guide](docs/packages/server.md).
- For changes to `packages/web` or starting both apps, read the [web guide](docs/packages/web.md).
- Do not stage, commit, push, open PRs, merge, publish, deploy, or send external messages without authorization for that action.

## Git workflow

- Use the primary repository checkout for all development, with a dedicated branch per task. Do not implement directly on `main`.
- Do not create or switch to additional Git worktrees unless the user explicitly requests it.
- Allow only one active session to write to the shared checkout; coordinate before switching branches.
- Start new task branches from the latest remote default branch unless the task specifies another base. Do not carry unrelated uncommitted changes into the task.
- When committing is authorized, use Conventional Commits: `type(scope): description`, with an optional scope. Examples: `feat: add session list`, `fix: handle reconnect`, `docs: clarify setup`.
- Preserve other branches and unrelated work. Do not delete a branch or repository checkout without explicit authorization.

## Verification

The user runs `mise run dev` in their own terminal. Use those development servers; do not start, stop, or restart them unless explicitly requested. Tell the user when a restart is required. Continue running relevant checks and tests.

Install shared tools with `mise install`, then run `pnpm install --frozen-lockfile`. Mise manages Node.js (`lts`), pnpm (`latest`), and Biome (`latest`) for all packages. Use pnpm for workspace dependencies and scripts. Biome handles JavaScript, TypeScript, JSON, CSS, and GraphQL checks: `pnpm check` reports issues; `pnpm check:fix` applies safe fixes. Markdown remains with RumDL.

Run from the repository root:

```bash
prek run --all-files
```

For application changes, also run `pnpm typecheck`, `pnpm test`, and `pnpm build`.

For new untracked files, also run `prek run --files` with their explicit paths; staging is not required. Inspect hook changes and report what actually ran, its results, and any limitations.
