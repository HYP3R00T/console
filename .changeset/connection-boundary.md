---
"@console/server": patch
"@console/web": patch
---

# Connection boundary

Unify backend commands and streams behind an injectable connection client with shared cleanup.
Separate server HTTP access policy from feature routes. Remember the explicitly selected backend
and check it on reload.
