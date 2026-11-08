export type Shortcut = `Mod+${string}` | `Alt+${string}`;

export const commands = {
  "settings.open": { label: "Open settings" },
  "preferences.configuration": { label: "Open client configuration backup" },
  "machine.workspace-guidance.update": {
    label: "Edit machine workspace guidance",
  },
  "machine.runtime-defaults.update": {
    label: "Edit new-chat runtime defaults",
  },
  "project.agent-settings.update": { label: "Edit project agent settings" },
  "session.runtime-settings.update": { label: "Edit session runtime settings" },
  "conversation.configure": { label: "Edit conversation settings" },
  "conversation.stop": { label: "Stop conversation" },
  "conversation.continue": { label: "Continue conversation run" },
  "conversation.compact": { label: "Compact conversation context" },
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

const namedShortcutKeys = new Set([
  "Space",
  "Enter",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);
function isShortcut(value: unknown): value is Shortcut {
  if (typeof value !== "string") return false;
  const match = /^(?:Mod\+(?:Alt\+)?|Alt\+)(?:Shift\+)?(.+)$/.exec(value);
  if (!match || /^Mod\+[ACVXYZ]$/.test(value) || value === "Mod+Shift+Z")
    return false;
  const key = match[1];
  return (
    /^[A-Z0-9]$/.test(key) ||
    [",", ".", "/", ";", "'", "[", "]", "\\", "-", "="].includes(key) ||
    /^F(?:[1-9]|1[0-2])$/.test(key) ||
    namedShortcutKeys.has(key)
  );
}
const punctuationCodes: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
};
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
  > &
    Partial<Pick<KeyboardEvent, "code">>,
) {
  if (
    event.isComposing ||
    (event.ctrlKey && event.metaKey) ||
    !(event.ctrlKey || event.metaKey || event.altKey) ||
    event.getModifierState("AltGraph")
  )
    return;
  const code = event.code ?? "";
  let key = /^Key[A-Z]$/.test(code)
    ? code.slice(3)
    : /^Digit[0-9]$/.test(code)
      ? code.slice(5)
      : (punctuationCodes[code] ?? event.key);
  if (key.length === 1) key = key === " " ? "Space" : key.toUpperCase();
  const candidate = `${event.ctrlKey || event.metaKey ? "Mod+" : ""}${event.altKey ? "Alt+" : ""}${event.shiftKey ? "Shift+" : ""}${key}`;
  return isShortcut(candidate) ? candidate : undefined;
}
export function formatShortcut(
  shortcut: Shortcut | null | undefined,
  platform: string,
): string {
  if (!shortcut) return "Unassigned";
  const modifier = /Mac|iPhone|iPad|iPod/.test(platform) ? "Command" : "Ctrl";
  return shortcut
    .split("+")
    .map((key) =>
      key === "Mod" ? modifier : key.startsWith("Arrow") ? key.slice(5) : key,
    )
    .join(" + ");
}

export function ariaShortcut(shortcut: Shortcut | null) {
  if (!shortcut) return undefined;
  return shortcut.startsWith("Mod+")
    ? `${shortcut.replace("Mod", "Control")} ${shortcut.replace("Mod", "Meta")}`
    : shortcut;
}
