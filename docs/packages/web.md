# Web

A Next.js/React client at `http://127.0.0.1:3001/` with a full-width shadcn Base UI sidebar and resizable desktop panels.

## Routes and workflow

- `/`: cross-device overview showing saved devices, current connection state and Add device.
- `/devices/[deviceId]`: selected device workspace.
- `/devices/[deviceId]/settings`: explicit connect, check and disconnect.
- `/devices/[deviceId]/preview/[conversationId]`: simulated conversation/subagent/fork view.
- `/settings`: redirects to saved devices.
- `/settings/connections`: browser-local bookmarks, search, open, forget and Add device.
- `/settings/connections/new`: name and local URL form; opens the saved device without connecting.
- `/settings/appearance`: System, Light and Dark theme selection.

Two navigation columns separate scope. The client column animates between 256px expanded and 56px collapsed over 200ms,
respecting reduced motion and clipping overflow.
It lists all devices and keeps Home, Add device and Client preferences accessible. Each expanded
device row selects the workspace and independently expands/collapses its metadata vertically: URL,
connection state, last successful check and Connect/Disconnect/Cancel. Row and details share one
borderless card background; selected cards are shaded. Compact device icons navigate.
Selecting a device never connects automatically.

The adjacent backend panel shows its collapsible project/session/conversation preview and Device
settings. Selecting Preferences instead places saved-device and Appearance categories in the second column.
Projects and agent relationships are examples; no backend workspace APIs exist yet. Uptime and
connected-client metrics are unavailable and are not simulated.

The context column is absent on Home, animating its occupied width to zero without translating
content. Entering a device or Preferences starts it collapsed to a 56px icon rail. Within that
context its state is preserved, including when the primary column is toggled. Desktop expansion
is pointer/keyboard-resizable between 208 and 384px and restores the last expanded width.
The compact resize separator is disabled and has no resize hit area; expand with the toggle first.
Expanded dragging cannot collapse the panel or stretch a compact rail into a blank wide column.

Both chevron toggles retain their top-left position. Width transitions last 200ms, skip reduced
motion and are disabled during pointer resizing. Mobile uses context sheets and hides its compact
context rail on Home. Preference categories remain accessible from the compact contextual rail.
There is no navigation toolbar in the content pane.
Columns use different surface tones rather than divider borders; in dark mode the client column
is lightest and content darkest. Dashed tree elbows terminate at the last sibling and connect
conversations, subagents and forks. Expanding a tree node does not shade it; hover and selected
conversation backgrounds are separate. Remaining borders default to dashed strokes; selection uses backgrounds and focus rings stay visible.
The right pane is route content today; split conversations and file/code/Markdown views remain future work.

Device names and URLs are stored in this browser, not the backend. Reload preserves bookmarks
and appearance but clears active selection/connection. Navigation preserves a connection.
A connected browser checks every five seconds; checks time out after five seconds. Disconnect
or forgetting the active device aborts requests without stopping the backend. No token or API
cookie is used; only loopback URLs are accepted. Corrupt bookmark storage is not overwritten.

## UI foundation

The official CLI installed the user-selected preset `bddBUJXM`: Base UI Lyra, Zinc, Geist and
Lucide. The theme radius is set to zero. `components.json` configures future component installs;
use library components from `src/components/ui` before creating a custom primitive.

`src/components/layout` owns the shell/sidebar, `devices` owns bookmark state, `workspace` owns device views and the project preview,
and `settings` owns saved-device management, Add device and Appearance views. `connection-provider.tsx` owns connection lifecycle. Shared validation
lives in `src/lib/connection.ts` and `src/lib/devices.ts`. See [architecture](../architecture.md).

For another component, run `pnpm dlx shadcn@latest add <component> --cwd packages/web` from the root.
Generated code still needs repository formatting and checks. Match the zero-radius theme.

## Commands and verification

After the [shared setup](../../README.md#development), run `mise run dev:web` separately.
Production uses `pnpm build`, then `pnpm --filter @console/web start`.
Next.js provides native output. Do not start, stop or restart the owner's development servers.

Client tests cover connection policy and bookmark validation. Types/build check integration.
Manual browser checks cover saved-device navigation/search/connect, reload persistence, pointer/keyboard resizing,
independent column collapse, route-dependent context visibility, initially collapsed context entry, inline device disclosures, Home overview, width restoration, project preview collapse, client/device scope switching, category navigation, theme controls and mobile navigation. There is no automated browser suite or cross-tab merge protocol.
See [README](../../README.md#checks) for shared checks.
