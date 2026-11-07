---
"@console/server": minor
"@console/web": minor
---

# Retry failed background jobs

Add explicit recovery for failed and cancelled jobs while retaining original receipts and settings. Require acknowledgement of possible earlier effects, reject changed workspace/tool policy, and deduplicate retry requests across restarts.
