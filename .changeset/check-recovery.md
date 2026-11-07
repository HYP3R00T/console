---
"@console/server": minor
"@console/web": minor
---

# Recover interrupted post-run checks

Add explicit rechecking through a new assistant run and Durable's existing after-run barrier. Preserve original receipts, deduplicate admission across restart, link replacement checks and hold queued input until checks finish.

Show the actual check result in task history rather than reporting every normally finished check as completed.
