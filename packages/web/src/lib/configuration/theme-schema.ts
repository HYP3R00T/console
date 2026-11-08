export const themeTokens = [
  "client-surface",
  "sidebar-hover",
  "sidebar-selected",
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;
export type ImportedTheme = {
  id: string;
  name: string;
  mode: "light" | "dark";
  tokens: Partial<Record<(typeof themeTokens)[number], string>>;
};
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a configuration object.");
  return value as Record<string, unknown>;
}
export function exact(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error("Unexpected or missing configuration fields.");
}
export function parseTheme(value: unknown): ImportedTheme {
  const theme = object(value);
  exact(theme, ["id", "name", "mode", "tokens"]);
  if (
    typeof theme.id !== "string" ||
    !/^custom-[a-z0-9-]{1,50}$/.test(theme.id) ||
    typeof theme.name !== "string" ||
    !theme.name.trim() ||
    theme.name.length > 80 ||
    !["light", "dark"].includes(String(theme.mode))
  )
    throw new Error("Invalid theme identity, name or mode.");
  const tokens = object(theme.tokens);
  if (
    !Object.keys(tokens).length ||
    Object.entries(tokens).some(
      ([key, value]) =>
        !themeTokens.includes(key as (typeof themeTokens)[number]) ||
        typeof value !== "string" ||
        !/^#[\da-f]{6}$/i.test(value),
    )
  )
    throw new Error(
      "Theme tokens must use supported names and six-digit hex colors.",
    );
  return {
    id: theme.id,
    name: theme.name,
    mode: theme.mode as ImportedTheme["mode"],
    tokens: { ...tokens },
  } as ImportedTheme;
}
