# Explicit connections owned by the web server

Status: accepted through the maintainer's request for disconnected onboarding and manual machine connections.

## Context

The web client assumed a local Fastify hub and automatically selected its synthetic local machine.
That prevented a true disconnected state and required one execution backend to manage other ones.
The reference tour also showed that extension selection must include prompt sections and hooks.

## Decision

Own the private connection registry and bounded proxy in Next.js. Start empty, with no default-port
probe, LAN discovery, automatic enrollment, or fallback machine. Verify product/API version and
machine identity on explicit connection. Persist only validated URLs, tokens, and safe labels.
Keep tokens server-side and support tokenless loopback backends; remote access still requires
configured authentication. Retire the implicit web proxy without deleting existing machine data.

Select actual registered Pi extensions through their native configuration API. Their tools cannot
exceed sandbox grants; child conversations inherit the selected extensions. Installing arbitrary
code, typed state editors, job workflows and approvals are separate work.

The subsequent maintainer request adds opt-in local checks and managed SSH without automatic
enrollment. Disconnected address/name/SSH metadata remains in Recent machines until forgotten.

## Consequences

Onboarding and connection management work with every execution backend offline. Disconnect
deactivates a connection and clears its saved token; it does not cancel work or delete backend history.
The web registry must be backed up separately from machine databases. Backend legacy hub APIs
remain for compatibility but do not enroll the browser or populate the new registry. This updates
the browser/hub ownership boundary in [ADR 0004](0004-backend-hub-and-conversations.md).
