---
"@console/web": patch
---

# Derive thinking choices from each selected model's Pi AI capabilities

Expose every thinking level reported for the selected model, without a global preference filter
or hardcoded slider tiers. Hide thinking for off-only models; explain fixed-thinking models
without a fake slider. Keep supported choices on model changes and reset incompatible choices
to the model's first supported level. Remove the global thinking-filter editor. Preserve local
composer drafts and apply configuration only on Send.
