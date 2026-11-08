import type { ImportedTheme } from "./theme-schema.ts";
import {
  type Appearance,
  activeTheme,
  completeTheme,
  themeCatalog,
} from "./themes.ts";

/** Ephemeral previews never write browser preferences and cannot outlive their picker. */
export class ThemePreviewStore {
  private value?: { owner: symbol; id: string; mode: "light" | "dark" };
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  get() {
    return this.value;
  }
  show(owner: symbol, id: string, mode: "light" | "dark") {
    this.value = { owner, id, mode };
    this.emit();
  }
  clear(owner: symbol) {
    if (this.value?.owner === owner) {
      this.value = undefined;
      this.emit();
    }
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }
  resolve(
    appearance: Appearance,
    systemMode: "light" | "dark",
    imported: ImportedTheme[],
  ) {
    const mode = appearance.mode === "system" ? systemMode : appearance.mode;
    const preview =
      this.value?.mode === mode
        ? themeCatalog(imported).find(
            (theme) => theme.id === this.value?.id && theme.mode === mode,
          )
        : undefined;
    return preview
      ? completeTheme(preview)
      : activeTheme(appearance, systemMode, imported);
  }
}
export const themePreview = new ThemePreviewStore();
