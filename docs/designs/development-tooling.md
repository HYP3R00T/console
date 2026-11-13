# Development tooling baseline

- Status: Implemented baseline, reconstructed on 2026-11-14; not a new implementation proposal.
- Evidence: current source and the generated directory contracts; historical choices are not inferred from code.

Workspace installation, quality checks, scripts and dependency patches.
See the [behavior/development guide](../development.md) for operational details and [coverage index](coverage.md) for file ownership.

## Scope and rationale

This document preserves current component contracts in one place so future work can load the relevant subsystem without scanning a README hierarchy.
It records observed behavior; it does not claim to reconstruct undocumented historical alternatives or prove runtime correctness.

## Development scripts

Source root: `scripts`.

### Development scripts overview

Explicit setup and Mise-enter helpers for installing shared tooling and Git hooks.

### Development scripts interface

- [setup.sh](../../scripts/setup.sh): trusts mise.toml and installs configured tools.
- [enter_project.sh](../../scripts/enter_project.sh): installs Commitizen when uv is available and cz is missing; ensures Prek pre-commit and commit-msg hooks.

### Development scripts invariants

- Both scripts use `set -euo pipefail` and switch to the project root before setup.
- `enter_project.sh:MISE_PROJECT_ROOT` overrides root discovery; existing hooks containing prek are retained.

### Development scripts side effects

- `setup.sh` changes Mise trust and installs tools.
- `enter_project.sh` can install a uv tool and overwrite missing/non-Prek Git hooks; do not run these scripts merely to inspect them.

### Development scripts verification

- Run `shellcheck scripts/enter_project.sh scripts/setup.sh` from the repository root.

## Workspace and build configuration

| File | Responsibility |
| --- | --- |
| [package.json](../../package.json) | Workspace build/test/typecheck and Biome/Changesets command entry points. |
| [pnpm-workspace.yaml](../../pnpm-workspace.yaml) | Package discovery, allowed dependency builds and exact dependency-patch registration. |
| [pnpm-lock.yaml](../../pnpm-lock.yaml) | Resolved package dependencies and patch identities; install with the frozen lockfile. |
| [mise.toml](../../mise.toml) | Shared tools, development tasks and the enter hook. |
| [mise.lock](../../mise.lock) | Resolved Mise tool versions; maintain through the configured tooling. |
| [server package.json](../../packages/server/package.json) | Server scripts, engine requirement and pinned Pi/Durable dependencies. |
| [server tsconfig.json](../../packages/server/tsconfig.json) | Strict NodeNext checking for production and test TypeScript. |
| [server tsconfig.build.json](../../packages/server/tsconfig.build.json) | Production-only output into dist. |
| [web package.json](../../packages/web/package.json) | Next development/build/start, route type generation and client tests. |
| [web tsconfig.json](../../packages/web/tsconfig.json) | Strict browser/bundler checking, @/ imports and generated Next types. |
| [contracts package.json](../../packages/contracts/package.json) | Direct TypeScript export consumed by the workspace packages. |
| [components.json](../../packages/web/components.json) | shadcn component conventions, source aliases and stylesheet selection. |
| [biome.json](../../biome.json) | Formatting/linting scope, recommended rules and Tailwind stylesheet discovery. |
| [rumdl.toml](../../rumdl.toml) | Markdown flavor and configured rule exceptions. |
| [.editorconfig](../../.editorconfig) | UTF-8, LF, whitespace and indentation conventions. |
| [.gitattributes](../../.gitattributes) | Git text/binary, newline, diff and archive treatment, including exact patch line endings. |
| [.gitignore](../../.gitignore) | Generated output, dependency caches, local configuration and runtime-data exclusions. |
| [.pre-commit-config.yaml](../../.pre-commit-config.yaml) | Pinned repository hooks for file hygiene, Markdown, shell, Biome and commit messages. |
| [.changeset/config.json](../../.changeset/config.json) | Private package version/changelog policy without automatic commits or tags. |
| [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | Repository hooks and application typecheck/test/build jobs, with required disposable-runner sandbox support. |
| [.github/dependabot.yml](../../.github/dependabot.yml) | Dependency-update automation configuration. |
| [.github/FUNDING.yml](../../.github/FUNDING.yml) | Repository funding metadata. |
| [bug report form](../../.github/ISSUE_TEMPLATE/bug_report.yml) | Structured bug intake. |
| [feature request form](../../.github/ISSUE_TEMPLATE/feature_request.yml) | Structured feature intake. |
| [maintenance form](../../.github/ISSUE_TEMPLATE/maintenance.yml) | Structured maintenance intake. |
| [issue configuration](../../.github/ISSUE_TEMPLATE/config.yml) | GitHub issue-template configuration. |
| [.devcontainer/devcontainer.json](../../.devcontainer/devcontainer.json) | Container build selection and post-create setup command. |
| [.devcontainer/Dockerfile](../../.devcontainer/Dockerfile) | Ubuntu development image with Mise, uv and shell activation. |

## Dependency patches

- [Pi AI declaration patch](../../patches/@earendil-works__pi-ai@1.5.0.patch) adds JSON import attributes to generated model declarations required by the TypeScript toolchain; runtime provider code is not changed by this declaration patch.
- [Next/React transition patch](../../patches/next@16.4.3.patch) treats Chromium's hidden-document InvalidStateError as a skipped view transition across bundled runtime variants; other errors retain their handling.
- Patches are registered in pnpm-workspace.yaml, are version-specific and must be reassessed when upgrading their dependencies; the [transition regression test](../../packages/web/test/view-transition-errors.test.ts) covers the error filters.

## Verification suites

[Development](../development.md) owns verification commands and environment limitations.
The server and web package test scripts run direct test/*.test.ts files with Node's test runner; the [coverage inventory](coverage.md#verification-sources) lists each test/support module and its declared test focus.
Server tests use disposable storage, fake providers and targeted integration fixtures; they do not establish arbitrary live-provider entitlement or production-scale behavior.
[Harness fixture](../../packages/server/test/support/harness-fixture.ts) supplies shared server test setup, and the [Durable 1.4 fixture](../../packages/server/test/fixtures/durable-1.4.0.json) supplies migration input.
Application edits require type checks, tests and builds; documentation-only edits require Markdown, repository-hook and local-link checks.
The test modules and fixtures are verification owners, not a claim that those tests were rerun during documentation consolidation.
