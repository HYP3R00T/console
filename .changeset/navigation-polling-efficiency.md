---
"@console/server": patch
"@console/web": patch
---

# Reduce navigation and inspector read overhead

Batch navigation conversation summaries into the session list, retaining the default API and
older-server fallback. Read project membership and runtime task inspections once per list.
Share polling cleanup/scheduling and stop hidden detail reads while retaining form drafts.
