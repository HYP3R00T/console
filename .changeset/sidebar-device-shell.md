---
"@console/web": minor
---

# Device rail and scoped workspace navigation

Apply the selected shadcn Base UI Lyra/Zinc preset with Geist, Lucide and zero-radius styling.
Separate an expandable client/device column from a resizable backend context panel. Both collapse
to compact rails with toggles anchored at the same position in either state; the backend panel restores its last expanded width. Keep all saved devices, Home, Add device and the Preferences entry in the primary column.
Hide the context column on Home; entering devices or Preferences starts it collapsed. Put preference
category navigation in that contextual column. Preserve open state when toggling the primary column,
use anchored chevron icons and animate the contextual width with reduced-motion support.

Separate client appearance/bookmarks from device connection settings. Device navigation does not
connect automatically. Demonstrate projects, sessions, conversations, subagents and forks through
clearly marked frontend previews; these backend capabilities are not implemented.
Disable the context resize handle while compact and constrain expanded dragging to a usable width.
Make each full-width device row an independent vertically animated Collapsible trigger.
Use borderless shaded device cards with Connect/Disconnect/Cancel, distinct column surface tones,
and dashed tree branches that end at the final child. Separate hover/selection from disclosure state.
Add inline device connection details and a Home overview of saved devices and current connection
state. Reserve the content pane for route content without a navigation toolbar. Uptime, client counts
and split conversation/file views are not implemented.
Saved devices survive reload; connections remain explicit and local-only.
