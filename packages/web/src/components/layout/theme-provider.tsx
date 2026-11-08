"use client";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type ComponentProps, useEffect, useState } from "react";
import {
  clientConfiguration,
  type ImportedTheme,
  subscribeConfiguration,
  themeTokens,
} from "@/lib/configuration/store";
import { themePreview } from "@/lib/configuration/theme-preview";
import {
  type Appearance,
  defaultAppearance,
  themeCatalog,
} from "@/lib/configuration/themes";

function ThemeConfiguration() {
  const { setTheme, systemTheme, theme: runtimeMode } = useTheme();
  useEffect(() => {
    function apply() {
      try {
        const store = clientConfiguration(),
          appearance = store.appearance();
        const theme = themePreview.resolve(
          appearance,
          systemTheme === "dark" ? "dark" : "light",
          store.themes(),
        );
        if (runtimeMode !== appearance.mode) setTheme(appearance.mode);
        const style = document.documentElement.style;
        for (const token of themeTokens) style.removeProperty(`--${token}`);
        for (const [token, value] of Object.entries(theme.tokens))
          style.setProperty(`--${token}`, value);
      } catch {
        /* Keep the last applied theme when storage is unavailable. */
      }
    }
    apply();
    const saved = subscribeConfiguration(apply);
    const preview = themePreview.subscribe(apply);
    return () => {
      saved();
      preview();
    };
  }, [setTheme, systemTheme, runtimeMode]);
  return null;
}
export function ThemeProvider(
  props: ComponentProps<typeof NextThemesProvider>,
) {
  return (
    <NextThemesProvider {...props} storageKey="console.theme.runtime">
      <ThemeConfiguration />
      {props.children}
    </NextThemesProvider>
  );
}
export function useClientAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance);
  const [themes, setThemes] = useState<ImportedTheme[]>([]);
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  const { systemTheme } = useTheme();
  useEffect(() => {
    function load() {
      try {
        const store = clientConfiguration();
        setAppearance(store.appearance());
        setThemes(store.themes());
        setError(undefined);
      } catch {
        setError("Could not read client appearance.");
      }
      setReady(true);
    }
    load();
    return subscribeConfiguration(load);
  }, []);
  function save(next: Appearance) {
    try {
      clientConfiguration().saveAppearance(next);
      setError(undefined);
    } catch {
      setError(
        "Could not save appearance. Your saved preferences are unchanged.",
      );
    }
  }
  return {
    appearance,
    themes: themeCatalog(themes),
    error,
    ready,
    activeMode: !ready
      ? undefined
      : appearance.mode === "system"
        ? systemTheme === "dark"
          ? "dark"
          : "light"
        : appearance.mode,
    setMode: (mode: Appearance["mode"]) => save({ ...appearance, mode }),
    select: (mode: "light" | "dark", id: string) =>
      save({
        ...appearance,
        [mode === "dark" ? "darkTheme" : "lightTheme"]: id,
      }),
    importTheme: (value: unknown) => clientConfiguration().importTheme(value),
  };
}
