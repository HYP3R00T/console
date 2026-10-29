---
"@console/server": minor
"@console/web": minor
---

# Remove nono sandbox integration

Run Pi Durable CodingTools directly through NodeExecutionEnv in the project working directory.
Tools have the backend account's host filesystem, network and inherited environment authority.
Delete nono policies, grants/access presets, workers, execution bridge, sandbox APIs/DTOs/editor,
and mise/CI installation. Directory/HTTP operations use native bash instead of custom adapters.
Keep project Markdown resources, providers, durable sessions, coordination and recorded plans.

Breaking pre-1.0 change: no compatibility aliases or saved-task migration. Database files remain,
but tasks referring to removed tools/extensions are unsupported. Restart the backend; select
installed tools while idle if a saved conversation retains obsolete tool names.
