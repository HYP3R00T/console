---
"@console/server": minor
"@console/web": minor
---

# Use one hidden project runtime with separate conversations and explicit memory

Show project folders directly under their machine, without a redundant Projects heading or session layer. New conversation reuses the project's
single Harness/database; the first thread reuses unused Main. Keep conversation configuration,
history, forks and task ownership distinct. Retried creation selects the original conversation.

Store shared project memory in native Pi session documents, with revision checks and atomic tool
receipts. Expose it under Project settings and through read_state/update_state. Other projects
have separate memory; machine operator JSON remains independent. Full transcripts are not merged.

Breaking pre-1.0 change: one runtime per project and no legacy root-database import or migration.
Experimental histories are reset at the maintainer's explicit request. Project files and provider
credentials remain. Sessions stay in internal API/storage names; they are not user-created groups.
