import type { CommandId } from "./commands.ts";

const aliases: Partial<Record<CommandId, string[]>> = {
  "workspace.navigation": [
    "toggle left sidebar",
    "left panel",
    "hide navigation",
    "show navigation",
  ],
  "workspace.details": [
    "toggle right sidebar",
    "right panel",
    "inspector",
    "conversation details",
  ],
  "preferences.appearance": ["appearance settings", "theme settings", "colors"],
  "preferences.shortcuts": ["keyboard shortcuts", "keybindings", "hotkeys"],
  "preferences.configuration": [
    "configuration backup",
    "export",
    "import",
    "preferences",
  ],
  "settings.open": ["preferences", "all settings", "configuration"],
  "conversation.configure": [
    "conversation settings",
    "tools",
    "instructions",
    "sandbox",
    "model",
  ],
  "project.agent-settings.update": [
    "project settings",
    "instructions",
    "tools",
    "evidence",
  ],
  "session.runtime-settings.update": [
    "session settings",
    "harness",
    "token budget",
    "compaction",
    "policies",
  ],
  "conversation.new": ["new chat", "create conversation", "start chat"],
  "conversation.stop": ["cancel", "stop run", "interrupt"],
  "conversation.continue": ["resume", "retry run"],
  "conversation.compact": ["summarize", "compaction", "context"],
  "machine.workspace-guidance.update": [
    "workspace instructions",
    "machine guidance",
  ],
  "machine.runtime-defaults.update": [
    "default model",
    "new conversation defaults",
    "runtime defaults",
  ],
  "machine.providers": ["providers", "models", "API keys"],
  "appearance.theme": ["theme", "colors", "appearance", "color scheme"],
  "appearance.light-theme": ["light default theme", "day colors"],
  "appearance.dark-theme": ["dark default theme", "night colors"],
  "appearance.mode": [
    "light mode",
    "dark mode",
    "system appearance",
    "display mode",
  ],
};
export function commandAliases(id: CommandId) {
  return aliases[id] ?? [];
}
function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[.:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function oneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length || i === b.length) return true;
  if (a.length === b.length)
    return (
      a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] &&
        a[i + 1] === b[i] &&
        a.slice(i + 2) === b.slice(i + 2))
    );
  return a.length > b.length
    ? a.slice(i + 1) === b.slice(i)
    : a.slice(i) === b.slice(i + 1);
}
function wordScore(needle: string, text: string) {
  if (text === needle) return 140;
  if (/^\d+$/.test(needle)) return text.split(" ").includes(needle) ? 95 : 0;
  if (text.startsWith(needle)) return 110;
  const words = text.split(" ");
  if (words.some((word) => word === needle)) return 95;
  if (words.some((word) => word.startsWith(needle))) return 80;
  if (text.includes(needle)) return 65;
  if (
    needle.length >= 4 &&
    !/\d/.test(needle) &&
    words.some((word) => word.length >= 4 && oneEdit(needle, word))
  )
    return 50;
  // Ordered subsequences tolerate abbreviations without guessing executable intent.
  if (needle.length < 3) return 0;
  let index = 0,
    first = -1,
    last = -1;
  for (let i = 0; i < text.length && index < needle.length; i++)
    if (text[i] === needle[index]) {
      if (first < 0) first = i;
      last = i;
      index++;
    }
  const gaps = last - first + 1 - needle.length;
  return index === needle.length &&
    gaps <= Math.max(2, Math.floor(needle.length / 2))
    ? 35 - gaps
    : 0;
}
export function paletteSearchScore(
  query: string,
  primary: string[],
  secondary: string[] = [],
) {
  const search = normalized(query);
  if (!search) return 1;
  const main = primary.map(normalized),
    details = secondary.map(normalized);
  const scores = search
    .split(" ")
    .map((term) =>
      Math.max(
        0,
        ...main.map((text) => wordScore(term, text)),
        ...details.map((text) => Math.max(0, wordScore(term, text) - 35)),
      ),
    );
  if (scores.some((score) => score === 0)) return 0;
  return (
    scores.reduce((a, b) => a + b, 0) +
    (main.some((text) => text === search) ? 200 : 0)
  );
}
export function rankPaletteResults<T>(
  items: T[],
  score: (item: T) => number,
  boost: (item: T) => number = () => 0,
) {
  return items
    .map((item, index) => ({ item, index, score: score(item) }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score + boost(b.item) - (a.score + boost(a.item)) ||
        a.index - b.index,
    )
    .map((row) => row.item);
}

/** Preserve an existing selection across refreshes, including newly disabled commands. */
export function paletteSelection(
  current: string,
  options: { value: string; disabled?: boolean }[],
) {
  return options.some((option) => option.value === current)
    ? current
    : (options.find((option) => !option.disabled)?.value ?? "");
}
