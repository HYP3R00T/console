---
"@console/web": patch
---

# Keep model and thinking controls stable while saving

Keep saves visually silent. Give the trigger a stable width, reserve feedback and thinking-control space, keep model/checkmark rows from wrapping, and
retain the opened selection until the picker is reopened. Saving no longer inserts a row that
moves the popup or removes a slider step underneath the user.

Move configuration saves into chat-state ownership. Use the PATCH snapshot directly, pause detail
polling during mutations, discard stale responses and keep inline failure handling in the picker.
