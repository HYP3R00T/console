---
"@console/server": minor
"@console/web": minor
---

# Persistent agent controls

Add parent-scoped HTTP controls for persistent named agents, durable messaging and result delivery, transcript inspection, and cancellation.

Add Tasks inspector controls for creating agents, sending and steering requests, choosing result delivery, viewing transcripts, and stopping work.

Expose replay-safe model tools for creating, listing, messaging and waiting for agents, plus a non-replayed Stop tool; child agents cannot recursively create agents.

Keep persistent-agent work visible after its owner task completes and distinguish agent receipts from reviewer transcripts.
