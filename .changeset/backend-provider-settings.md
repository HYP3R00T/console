---
"@console/server": minor
"@console/web": minor
---

# Backend provider settings

Add backend-owned Pi AI provider management with private SQLite credential/favorite storage,
provider-owned API-key and OAuth login prompts, cancellation, disable/reconnect/remove and catalog
refresh. Expose model metadata and an API that filters future chat choices to enabled, available
favorites. Add backend-scoped provider settings and contextual provider-settings navigation.
Configured status means stored credentials, not verified upstream inference access. Chat execution,
SSE and a chat model picker are not implemented in this increment.
