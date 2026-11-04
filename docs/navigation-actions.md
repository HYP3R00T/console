# Navigation action contract

The sidebar describes machine-owned records. Pinned is a browser-local placement, not a new
project, session, or execution scope. A conversation keeps its session ID and workspace when pinned.

## Entities and actions

| Entity | Menu actions | Primary hover shortcut |
| --- | --- | --- |
| Project | New conversation, New session, Pin/Unpin, Edit, Remove | New conversation in Session 1 |
| Session | New conversation | New conversation in that session |
| Conversation | Rename, Pin/Unpin | None |
| Pinned section | Expand/Collapse | None |
| Projects section | Add project, Expand/Collapse | Add project |
| Recents section | New conversation, Expand/Collapse | New conversation outside projects |

`lib/navigation-actions.ts` declares capabilities per entity kind. `NavigationAction` supplies a
stable ID, label, icon, handler, disabled/destructive/separator flags, and optional primary shortcut.
`NavigationMenu` renders the same supported actions in both dots and right-click menus and derives
hover shortcuts from primary actions. Callers own backend requests, busy state and confirmations.
Do not implement a separate handler for the inline shortcut. Add an action to its entity capability
list and definition together. Hide unsupported operations rather than offer inert menu items.
Conversation removal needs a backend lifecycle operation before its action can be added.

Opening either menu temporarily shades its own row. This does not navigate, select a different
conversation, or alter its draft. Closing the menu releases that state. Keyboard focus reveals
shortcuts; touch keeps them visible. A pinned row has no redundant pin badge.

## Disclosure and placement

Pinned, Projects and Recents have rotating right/down chevrons and measured height reveal.
Project icon/name remains an arrow-free disclosure trigger. Single sessions remain visually flat;
multiple sessions retain their numbered group headings. Section collapse preserves nested state.

Pinned holds projects followed by individual chats, newest pins first within each kind. Every pinned
chat, including a project chat, leaves its source list. A pinned project can still expand; its separately
pinned chats do not duplicate inside it. Unpin restores the actual owner list and original ordering.
Pinned metadata resolves from the existing session conversation endpoint independently of project
expansion. Missing/archived/unreachable pins remain removable with Unpin; no history is erased.
The existing first-200-conversation listing limit also applies to pinned metadata resolution.

Native desktop dragging supports:

- Project to Pinned: pin; project to Projects: unpin.
- Any visible chat to Pinned: pin.
- Standalone chat to Recents: unpin.
- Project chat to its own project row: unpin. Expand that project to see it again.

Only an active drag initiated inside this machine's navigation can update pins. Payloads from files,
other tabs or other machines are not imported. A replaced/disconnected backend client cannot accept
a stale drag. The pure drop-intent resolver describes supported operations; menus provide the same
pin/unpin operations for keyboard and touch. Arbitrary manual ordering and touch dragging are not
implemented. Feedback stays outside document flow so drop targets do not shift mid-drag.

## Why moving a chat is deferred

A Durable conversation belongs to one session database, with tasks, checkpoints and model state.
Project sessions also supply project-specific working directories and inspection tools. Reparenting
a sidebar row would not transfer those records or change that scope correctly.

Cross-project moves and project-to-Recents moves are rejected with feedback. A future backend transfer
must define whether it moves a whole session or exports/imports one chat, require stopped work,
handle identifiers and pending tasks, change execution context explicitly, and recover interrupted
transfers. Pinning provides quick access today without changing ownership. Creating a new conversation
in the destination is another option; history is not automatically transferred.
