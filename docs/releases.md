# Versions and changelogs

Both workspace packages are private and currently versioned `0.1.0`. Changesets is installed
through Mise. It records package changes and prepares versions/changelogs; it does not publish,
deploy or commit automatically.

The Hello World baseline reset cleared pending Changeset entries without preparing a release
or changing package versions. Record future user-visible package changes normally.

## Record a change

Run `pnpm changeset`, select the affected packages and bump level, then commit its generated
`.changeset/*.md` entry with the implementation. Documentation-only and tooling-only changes
do not need an entry unless they affect released package behavior.

`pnpm changeset status` shows pending entries; its comparison base is `main`. After the baseline
reset it exits nonzero while package changes exist relative to `main` without a release entry.
That reports the deliberately empty release queue; it does not mean an application check failed.

## Prepare a release

Run `pnpm changeset version` only when preparing a release. Review the resulting package versions,
changelogs and consumed entries before committing. Publishing, tags and deployment are not configured.
