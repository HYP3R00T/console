# Versions and changelogs

Changesets is installed through mise (`npm:@changesets/cli`), alongside the other shared tools.
Run `mise install` before using the commands below.

The server and web app are private workspace packages.
Add a package's `name` and `version` to its manifest when it becomes a real workspace package.
Keep applications that are not intended for npm publication marked `private`.

## Record a package change

Run `pnpm changeset` from the repository root. Select the affected packages, choose a patch,
minor, or major bump, and describe the user-visible change. Include the generated
`.changeset/*.md` file with the implementation. Documentation-only and tooling-only changes
do not need a package release entry unless they affect a released package.

Use `pnpm changeset status` to inspect pending entries. Comparisons use `main` by default.

## Prepare versions and changelogs

Run `pnpm changeset version` when preparing a release. This consumes pending entries, updates
package versions and internal dependency ranges, and generates package changelogs. Review the
resulting changes before committing them.

Private packages receive versions and changelogs too, but are not published to npm or tagged
by this configuration. Changesets does not automatically commit. Publishing, deployment,
release tags, and release automation have not been configured.
