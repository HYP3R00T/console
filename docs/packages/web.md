# Web

A Next.js/React website at `http://127.0.0.1:3001/`, displaying "Hello, world!".
It uses browser-default styles and has no backend connection or application API routes.

## Commands

Run from the repository root after the [shared setup](../../README.md#development):

```bash
mise run dev:web
```

For production, run `pnpm build`, then `pnpm --filter @console/web start`.
Next.js provides native readiness, compilation and error output. Ctrl+C stops this app only.

See [architecture](../architecture.md) for the source map and the [README](../../README.md#checks)
for checks. Type checking and builds cover the website; there is no browser test suite.
