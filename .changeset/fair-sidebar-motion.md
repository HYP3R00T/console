---
"@console/web": patch
---

# Sidebar motion

Animate both sidebar toggles consistently and preserve the opposite sidebar's width as the workspace grows or shrinks.

Keep the details panel open while switching conversations, with an accessible busy status during loading and no skeletons or controls from the previous conversation.

Crossfade route content and initial conversation/details loading with native React view transitions, respecting reduced motion and leaving live updates immediate.

Keep workspace backgrounds solid during content crossfades and prevent opacity dips on shared surfaces.

Open machine settings directly at Providers to avoid an intermediate redirect during context changes.
