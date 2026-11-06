type Shortcut = `Mod+${string}`;

export const commands = {
  "palette.open": { label: "Open command palette", shortcut: "Mod+K" },
  "navigation.home": { label: "Go to Home" },
  "navigation.devices": { label: "Manage devices" },
  "preferences.appearance": { label: "Open appearance settings" },
  "preferences.shortcuts": { label: "Open keyboard shortcuts" },
  "workspace.navigation": {
    label: "Toggle workspace navigation",
    shortcut: "Mod+B",
  },
  "workspace.details": { label: "Toggle conversation details" },
  "conversation.new": { label: "New conversation" },
  "machine.providers": { label: "Open machine providers" },
  "machine.projects": { label: "Open machine project settings" },
  "machine.runtime": { label: "Open machine runtime defaults" },
  "machine.archives": { label: "Open machine archives" },
} satisfies Record<string, { label: string; shortcut?: Shortcut }>;

export type CommandId = keyof typeof commands;
export const commandIds = Object.keys(commands) as CommandId[];
export type ShortcutOverrides = Partial<Record<CommandId, Shortcut | null>>;
export const shortcutStorageKey = "console.shortcuts.v1";

export function defaultShortcut(id: CommandId): Shortcut | null {
  const command = commands[id];
  return "shortcut" in command ? command.shortcut : null;
}

export function shortcutFor(id: CommandId, overrides: ShortcutOverrides) {
  return overrides[id] === undefined ? defaultShortcut(id) : overrides[id];
}

export function shortcutConflict(
  id: CommandId,
  shortcut: Shortcut,
  overrides: ShortcutOverrides,
) {
  return commandIds.find(
    (other) => other !== id && shortcutFor(other, overrides) === shortcut,
  );
}

export function parseShortcuts(raw: string | null): ShortcutOverrides {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const overrides: ShortcutOverrides = {};
    for (const id of commandIds) {
      if (!Object.hasOwn(parsed, id)) continue;
      const value: unknown = (parsed as Record<string, unknown>)[id];
      if (value === null || isShortcut(value)) overrides[id] = value;
    }
    const active = commandIds
      .map((id) => shortcutFor(id, overrides))
      .filter(Boolean);
    return active.length === new Set(active).size ? overrides : {};
  } catch {
    return {};
  }
}

function isShortcut(value: unknown): value is Shortcut {
  return (
    typeof value === "string" &&
    /^Mod\+(?:Alt\+)?(?:Shift\+)?[A-Z0-9]$/.test(value) &&
    !/^Mod\+[ACVXYZ]$/.test(value) &&
    value !== "Mod+Shift+Z"
  );
}

export function shortcutFromEvent(
  event: Pick<
    KeyboardEvent,
    | "ctrlKey"
    | "metaKey"
    | "altKey"
    | "shiftKey"
    | "key"
    | "isComposing"
    | "getModifierState"
  >,
) {
  if (
    event.isComposing ||
    event.ctrlKey === event.metaKey ||
    event.getModifierState("AltGraph")
  )
    return;
  const candidate = `Mod+${event.altKey ? "Alt+" : ""}${event.shiftKey ? "Shift+" : ""}${event.key.toUpperCase()}`;
  return isShortcut(candidate) ? candidate : undefined;
}

export function ariaShortcut(shortcut: Shortcut | null) {
  return shortcut
    ? `${shortcut.replace("Mod", "Control")} ${shortcut.replace("Mod", "Meta")}`
    : undefined;
}
