---
"@console/web": patch
---

# Keep composer model and thinking choices local until Send

Update controls immediately in per-conversation client state without network writes or global
working-state changes. Apply changed configuration before submitting text and retain confirmed
configuration through uncertain admission retries. Polling cannot overwrite unsent choices.
Keep the existing interface and explicit Save behavior for other settings.
