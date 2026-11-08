import type { ImportedTheme, themeTokens } from "./theme-schema.ts";
import { completeTheme } from "./themes.ts";

type Token = (typeof themeTokens)[number];
export const themeTokenGroups = [
  {
    name: "Surfaces",
    tokens: [
      "background",
      "client-surface",
      "card",
      "popover",
      "secondary",
      "muted",
      "accent",
    ],
  },
  {
    name: "Text & actions",
    tokens: [
      "foreground",
      "card-foreground",
      "popover-foreground",
      "primary",
      "primary-foreground",
      "secondary-foreground",
      "muted-foreground",
      "accent-foreground",
      "destructive",
    ],
  },
  { name: "Borders", tokens: ["border", "input", "ring"] },
  {
    name: "Navigation",
    tokens: [
      "sidebar-hover",
      "sidebar-selected",
      "sidebar",
      "sidebar-foreground",
      "sidebar-primary",
      "sidebar-primary-foreground",
      "sidebar-accent",
      "sidebar-accent-foreground",
      "sidebar-border",
      "sidebar-ring",
    ],
  },
] as const satisfies readonly { name: string; tokens: readonly Token[] }[];
const families = [
  {
    id: "console",
    name: "Console",
    variants: [
      ["console-light", "Light"],
      ["console-dark", "Dark"],
    ],
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    variants: [
      ["catppuccin-latte", "Latte"],
      ["catppuccin-mocha", "Mocha"],
      ["catppuccin-frappe", "Frappé"],
      ["catppuccin-macchiato", "Macchiato"],
    ],
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    variants: [
      ["tokyo-night", "Night"],
      ["tokyo-night-storm", "Storm"],
      ["tokyo-night-moon", "Moon"],
      ["tokyo-night-light", "Day"],
    ],
  },
  { id: "nord", name: "Nord", variants: [["nord", "Default"]] },
  { id: "dracula", name: "Dracula", variants: [["dracula", "Default"]] },
  {
    id: "solarized",
    name: "Solarized",
    variants: [
      ["solarized-light", "Light"],
      ["solarized-dark", "Dark"],
    ],
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    variants: [
      ["gruvbox-light", "Light"],
      ["gruvbox-dark", "Dark"],
    ],
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    variants: [
      ["rose-pine", "Main"],
      ["rose-pine-moon", "Moon"],
      ["rose-pine-dawn", "Dawn"],
    ],
  },
] as const;
export type ThemeFamily = {
  id: string;
  name: string;
  variants: { theme: ImportedTheme; label: string }[];
};
export function groupThemeFamilies(
  themes: ImportedTheme[],
  mode: ImportedTheme["mode"],
): ThemeFamily[] {
  const result: ThemeFamily[] = [];
  const known = new Set<string>();
  for (const family of families) {
    const variants = family.variants.flatMap(([id, label]) => {
      const theme = themes.find(
        (theme) => theme.id === id && theme.mode === mode,
      );
      if (!theme) return [];
      known.add(id);
      return [{ theme, label }];
    });
    if (variants.length)
      result.push({ id: family.id, name: family.name, variants });
  }
  for (const theme of themes)
    if (theme.mode === mode && !known.has(theme.id))
      result.push({
        id: theme.id,
        name: theme.name,
        variants: [{ theme, label: "Imported" }],
      });
  return result;
}
export function themeColorGroups(theme: ImportedTheme) {
  const complete = completeTheme(theme);
  return themeTokenGroups.map((group) => {
    const colors = new Map<string, string[]>();
    for (const token of group.tokens) {
      const value = complete.tokens[token];
      if (!value) throw new Error(`Missing theme token: ${token}`);
      const hex = value.toLowerCase();
      colors.set(hex, [...(colors.get(hex) ?? []), token]);
    }
    return {
      name: group.name,
      colors: [...colors].map(([hex, roles]) => ({ hex, roles })),
    };
  });
}
