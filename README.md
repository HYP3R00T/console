# Console

A planned dashboard for managing AI agent sessions across workspaces and machines.

[![Quality Gate](https://img.shields.io/github/actions/workflow/status/HYP3R00T/console/ci.yml?branch=main&style=for-the-badge&label=Quality%20Gate&logo=githubactions)](https://github.com/HYP3R00T/console/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/HYP3R00T/console?style=for-the-badge&label=License)](LICENSE)

## Status

Console is in initial setup. This repository currently contains the development environment and repository checks; application code and dependencies will be added later.

The initial goal is a web client connected to an agent backend, with support for creating, viewing, and returning to sessions in a workspace. Remote machines and automation management are planned extensions.

## Development

Open the repository in Visual Studio Code with Docker and the Dev Containers extension installed, then run **Dev Containers: Reopen in Container**. Container setup installs the tools declared in `mise.toml` and configures Git hooks.

For an existing Linux development environment with Mise and uv installed:

```bash
bash scripts/setup.sh
bash scripts/enter_project.sh
```

Run the repository checks:

```bash
prek run --all-files
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and verification guidance.

## License

[MIT](LICENSE).
