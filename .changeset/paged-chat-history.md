---
"@console/server": patch
"@console/web": patch
---

# Open chats at the latest messages and page older history

Bound snapshots and history requests to 50 Pi entries. Load earlier pages on upward scroll,
retain loaded pages across live polling, preserve the visible message while prepending, and
follow new output only when the view is at the bottom.
