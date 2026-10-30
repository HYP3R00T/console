---
"@console/web": patch
---

# Restore sidebar dragging and retain sidebar sizing

Render only active resize separators so a hidden disabled details separator cannot block sidebar
pointer hit-testing. Add visible grips and usable pointer targets to sidebar/details splits.
Retain the collapsible sidebar rail and remember desktop proportions per browser tab, including
reloads. Preserve chat state, backend contracts and the existing compact layout.
