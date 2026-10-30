---
"@console/web": patch
---

# Show the selected model, thinking level and context occupancy in the composer

Combine model and thinking selection into one popover with an always-visible model/level label.
Select the model, then adjust its Pi-reported thinking tiers without leaving the popover.

Add a compact context ring backed by saved conversation estimates. Expose token counts and
capacity on demand, distinguish unavailable/cached estimates, and handle tiny or over-capacity
usage without confusing it with billing or unsaved model settings. Keep adjustments local until Send.
