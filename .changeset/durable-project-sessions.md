---
"@console/server": minor
"@console/web": minor
---

# Durable project sessions

Add project-owned harnesses, each opening one persistent Durable session with multiple conversations. Provide HTTP message admission with request deduplication, SSE snapshots, paged history and session-wide Stop. Add model selection, nested navigation and text chat. Preserve work across browser disconnects and recover sessions on backend startup. Block project removal until session cleanup is implemented.

Expose the one-to-one harness/session as a single numbered session in the UI/API. Create Session 1/Main with each project, allocate subsequent session/conversation names automatically, and use context menus for creation. Move validated model/thinking choices into an integrated icon-submit composer, remove header Live/Stop controls, and show Jump to latest only when scrolled away.
