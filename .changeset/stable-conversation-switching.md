---
"@console/web": patch
---

# Switch conversations without replacing chat with a loading screen

Cache 20 recent conversation snapshots per mounted machine workspace. Show cached threads
immediately and revalidate through existing polling. For uncached threads, retain the current
conversation until the target is ready, then change selection, URL and snapshot together.
Cancel superseded navigation, ignore late responses, retain the view on failure and invalidate
deleted cache projections. Preserve the current interface and backend contracts.
