import type { ImportedTheme } from "./theme-schema.ts";

// Console UI adaptations of upstream palettes; sources in docs/packages/web.md.
function palette(
  id: string,
  name: string,
  mode: ImportedTheme["mode"],
  p: {
    base: string;
    surface: string;
    raised: string;
    text: string;
    muted: string;
    accent: string;
    onAccent: string;
    border: string;
    danger: string;
  },
): ImportedTheme {
  return {
    id,
    name,
    mode,
    tokens: {
      "client-surface": p.surface,
      "sidebar-hover": p.raised,
      "sidebar-selected": p.border,
      background: p.base,
      foreground: p.text,
      card: p.surface,
      "card-foreground": p.text,
      popover: p.surface,
      "popover-foreground": p.text,
      primary: p.accent,
      "primary-foreground": p.onAccent,
      secondary: p.raised,
      "secondary-foreground": p.text,
      muted: p.raised,
      "muted-foreground": p.muted,
      accent: p.raised,
      "accent-foreground": p.text,
      destructive: p.danger,
      border: p.border,
      input: p.border,
      ring: p.accent,
      sidebar: p.surface,
      "sidebar-foreground": p.text,
      "sidebar-primary": p.accent,
      "sidebar-primary-foreground": p.onAccent,
      "sidebar-accent": p.raised,
      "sidebar-accent-foreground": p.text,
      "sidebar-border": p.border,
      "sidebar-ring": p.accent,
    },
  };
}
export const builtinThemes: ImportedTheme[] = [
  palette("console-light", "Console Light", "light", {
    base: "#ffffff",
    surface: "#f5f5f5",
    raised: "#ebebeb",
    text: "#18181b",
    muted: "#62626b",
    accent: "#27272a",
    onAccent: "#ffffff",
    border: "#dedede",
    danger: "#ba2438",
  }),
  palette("catppuccin-latte", "Catppuccin Latte", "light", {
    base: "#eff1f5",
    surface: "#e6e9ef",
    raised: "#dce0e8",
    text: "#4c4f69",
    muted: "#5c5f77",
    accent: "#8839ef",
    onAccent: "#ffffff",
    border: "#bcc0cc",
    danger: "#d20f39",
  }),
  palette("tokyo-night-light", "Tokyo Night Day", "light", {
    base: "#e1e2e7",
    surface: "#d0d5e3",
    raised: "#c4c8da",
    text: "#343b58",
    muted: "#4b4e63",
    accent: "#2959aa",
    onAccent: "#ffffff",
    border: "#b4b8ca",
    danger: "#8c4351",
  }),
  palette("console-dark", "Console Dark", "dark", {
    base: "#121213",
    surface: "#09090a",
    raised: "#18181a",
    text: "#e5e5e6",
    muted: "#a1a1aa",
    accent: "#e5e5e6",
    onAccent: "#27272a",
    border: "#38383b",
    danger: "#ff8598",
  }),
  palette("catppuccin-mocha", "Catppuccin Mocha", "dark", {
    base: "#1e1e2e",
    surface: "#181825",
    raised: "#313244",
    text: "#cdd6f4",
    muted: "#bac2de",
    accent: "#cba6f7",
    onAccent: "#1e1e2e",
    border: "#45475a",
    danger: "#f38ba8",
  }),
  palette("tokyo-night", "Tokyo Night", "dark", {
    base: "#1a1b26",
    surface: "#16161e",
    raised: "#24283b",
    text: "#c0caf5",
    muted: "#a9b1d6",
    accent: "#7aa2f7",
    onAccent: "#1a1b26",
    border: "#414868",
    danger: "#f7768e",
  }),
  palette("nord", "Nord", "dark", {
    base: "#2e3440",
    surface: "#3b4252",
    raised: "#434c5e",
    text: "#eceff4",
    muted: "#d8dee9",
    accent: "#88c0d0",
    onAccent: "#2e3440",
    border: "#4c566a",
    danger: "#bf616a",
  }),
  palette("dracula", "Dracula", "dark", {
    base: "#282a36",
    surface: "#21222c",
    raised: "#44475a",
    text: "#f8f8f2",
    muted: "#b8c0e0",
    accent: "#bd93f9",
    onAccent: "#282a36",
    border: "#6272a4",
    danger: "#ff5555",
  }),
  palette("catppuccin-frappe", "Catppuccin Frappé", "dark", {
    base: "#303446",
    surface: "#292c3c",
    raised: "#414559",
    text: "#c6d0f5",
    muted: "#b5bfe2",
    accent: "#ca9ee6",
    onAccent: "#303446",
    border: "#51576d",
    danger: "#e78284",
  }),
  palette("catppuccin-macchiato", "Catppuccin Macchiato", "dark", {
    base: "#24273a",
    surface: "#1e2030",
    raised: "#363a4f",
    text: "#cad3f5",
    muted: "#b8c0e0",
    accent: "#c6a0f6",
    onAccent: "#24273a",
    border: "#494d64",
    danger: "#ed8796",
  }),
  palette("tokyo-night-storm", "Tokyo Night Storm", "dark", {
    base: "#24283b",
    surface: "#1f2335",
    raised: "#292e42",
    text: "#c0caf5",
    muted: "#a9b1d6",
    accent: "#7aa2f7",
    onAccent: "#24283b",
    border: "#414868",
    danger: "#f7768e",
  }),
  palette("tokyo-night-moon", "Tokyo Night Moon", "dark", {
    base: "#222436",
    surface: "#1e2030",
    raised: "#2f334d",
    text: "#c8d3f5",
    muted: "#b4c2f0",
    accent: "#82aaff",
    onAccent: "#222436",
    border: "#444a73",
    danger: "#ff757f",
  }),
  palette("solarized-light", "Solarized Light", "light", {
    base: "#fdf6e3",
    surface: "#eee8d5",
    raised: "#e5dfcc",
    text: "#073642",
    muted: "#485e65",
    accent: "#006b9a",
    onAccent: "#fdf6e3",
    border: "#b7b6a8",
    danger: "#dc322f",
  }),
  palette("solarized-dark", "Solarized Dark", "dark", {
    base: "#002b36",
    surface: "#00212b",
    raised: "#073642",
    text: "#eee8d5",
    muted: "#93a1a1",
    accent: "#2aa198",
    onAccent: "#00212b",
    border: "#586e75",
    danger: "#dc322f",
  }),
  palette("gruvbox-light", "Gruvbox Light", "light", {
    base: "#fbf1c7",
    surface: "#f2e5bc",
    raised: "#ebdbb2",
    text: "#3c3836",
    muted: "#665c54",
    accent: "#076678",
    onAccent: "#fbf1c7",
    border: "#bdae93",
    danger: "#9d0006",
  }),
  palette("gruvbox-dark", "Gruvbox Dark", "dark", {
    base: "#282828",
    surface: "#1d2021",
    raised: "#3c3836",
    text: "#ebdbb2",
    muted: "#bdae93",
    accent: "#fabd2f",
    onAccent: "#282828",
    border: "#665c54",
    danger: "#fb4934",
  }),
  palette("rose-pine", "Rosé Pine", "dark", {
    base: "#191724",
    surface: "#1f1d2e",
    raised: "#26233a",
    text: "#e0def4",
    muted: "#b0adc7",
    accent: "#c4a7e7",
    onAccent: "#191724",
    border: "#524f67",
    danger: "#eb6f92",
  }),
  palette("rose-pine-moon", "Rosé Pine Moon", "dark", {
    base: "#232136",
    surface: "#2a273f",
    raised: "#393552",
    text: "#e0def4",
    muted: "#b6b2ce",
    accent: "#c4a7e7",
    onAccent: "#232136",
    border: "#56526e",
    danger: "#eb6f92",
  }),
  palette("rose-pine-dawn", "Rosé Pine Dawn", "light", {
    base: "#faf4ed",
    surface: "#fffaf3",
    raised: "#f2e9e1",
    text: "#575279",
    muted: "#6b6589",
    accent: "#286983",
    onAccent: "#fffaf3",
    border: "#cecacd",
    danger: "#b4637a",
  }),
];
export const defaultAppearance = {
  mode: "system",
  lightTheme: "console-light",
  darkTheme: "console-dark",
} as const;
export type Appearance = {
  mode: "system" | "light" | "dark";
  lightTheme: string;
  darkTheme: string;
};
export const appearanceKey = "console.appearance.v1";
export function themeCatalog(imported: ImportedTheme[]) {
  return [...builtinThemes, ...imported];
}
export function completeTheme(theme: ImportedTheme): ImportedTheme {
  const base = builtinThemes.find(
    (item) => item.id === `console-${theme.mode}`,
  );
  return { ...theme, tokens: { ...base?.tokens, ...theme.tokens } };
}
export function activeTheme(
  appearance: Appearance,
  systemMode: "light" | "dark",
  imported: ImportedTheme[],
) {
  const mode = appearance.mode === "system" ? systemMode : appearance.mode;
  const theme = themeCatalog(imported).find(
    (item) =>
      item.id ===
      (mode === "dark" ? appearance.darkTheme : appearance.lightTheme),
  );
  if (!theme || theme.mode !== mode)
    throw new Error("Selected theme is unavailable for this mode.");
  return completeTheme(theme);
}
export function parseAppearance(
  value: unknown,
  imported: ImportedTheme[],
): Appearance {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid appearance settings.");
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join(",") !== "darkTheme,lightTheme,mode" ||
    !["system", "light", "dark"].includes(String(data.mode)) ||
    typeof data.lightTheme !== "string" ||
    typeof data.darkTheme !== "string"
  )
    throw new Error("Invalid appearance settings.");
  const appearance = data as Appearance;
  activeTheme({ ...appearance, mode: "light" }, "light", imported);
  activeTheme({ ...appearance, mode: "dark" }, "dark", imported);
  return { ...appearance };
}
export function migrateAppearance(
  legacy: string,
  imported: ImportedTheme[],
): Appearance {
  if (["system", "light", "dark"].includes(legacy))
    return { ...defaultAppearance, mode: legacy as Appearance["mode"] };
  const theme = imported.find((item) => item.id === legacy);
  if (!theme) throw new Error("Unknown selected theme.");
  return {
    ...defaultAppearance,
    mode: theme.mode,
    [theme.mode === "dark" ? "darkTheme" : "lightTheme"]: theme.id,
  };
}
export function readAppearance(
  raw: string | null,
  legacy: string | null,
  imported: ImportedTheme[],
) {
  return raw
    ? parseAppearance(JSON.parse(raw), imported)
    : migrateAppearance(legacy ?? "system", imported);
}
export function themeDocument(theme: ImportedTheme): ImportedTheme {
  const complete = completeTheme(theme);
  return {
    ...complete,
    id: theme.id.startsWith("custom-") ? theme.id : `custom-${theme.id}`,
  };
}
