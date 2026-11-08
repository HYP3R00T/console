import type { ConfigurationStore } from "./store.ts";
import type { Appearance } from "./themes.ts";

export const appearanceCommandIds = [
  "appearance.theme",
  "appearance.light-theme",
  "appearance.dark-theme",
  "appearance.mode",
] as const;
export type AppearanceCommandId = (typeof appearanceCommandIds)[number];
export type AppearancePicker =
  | { kind: "theme"; mode: "light" | "dark" }
  | { kind: "mode" };
export function appearancePicker(
  id: AppearanceCommandId,
  activeMode: "light" | "dark",
): AppearancePicker {
  return id === "appearance.mode"
    ? { kind: "mode" }
    : {
        kind: "theme",
        mode:
          id === "appearance.light-theme"
            ? "light"
            : id === "appearance.dark-theme"
              ? "dark"
              : activeMode,
      };
}
export function applyAppearanceCommand(
  store: Pick<ConfigurationStore, "appearance" | "saveAppearance">,
  id: AppearanceCommandId,
  input: unknown,
): Appearance {
  const current = store.appearance();
  let next: Appearance;
  if (id === "appearance.mode") {
    if (input !== "system" && input !== "light" && input !== "dark")
      throw new Error("Choose System, Light or Dark.");
    next = { ...current, mode: input };
  } else {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("Choose a theme.");
    const { mode, themeId } = input as { mode?: unknown; themeId?: unknown };
    if (
      (mode !== "light" && mode !== "dark") ||
      typeof themeId !== "string" ||
      (id === "appearance.light-theme" && mode !== "light") ||
      (id === "appearance.dark-theme" && mode !== "dark")
    )
      throw new Error("Theme does not match the requested mode.");
    next = {
      ...current,
      [mode === "light" ? "lightTheme" : "darkTheme"]: themeId,
    };
  }
  store.saveAppearance(next);
  return next;
}
