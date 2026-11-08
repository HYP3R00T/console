"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type ComponentProps, useEffect, useState } from "react";
import {
  clientConfiguration,
  type ImportedTheme,
  parseTheme,
  subscribeConfiguration,
  themeTokens,
} from "@/lib/configuration/store";

function ThemeConfiguration() {
  const { setTheme } = useTheme();
  useEffect(() => {
    function apply() {
      try {
        const store = clientConfiguration();
        const selected = store.getItem("theme") ?? "system";
        const themes = (
          JSON.parse(store.getItem("console.themes.v1") ?? "[]") as unknown[]
        ).map(parseTheme);
        const custom = themes.find((theme) => theme.id === selected);
        setTheme(custom?.mode ?? selected);
        const style = document.documentElement.style;
        for (const token of themeTokens) style.removeProperty(`--${token}`);
        if (custom)
          for (const [token, value] of Object.entries(custom.tokens))
            style.setProperty(`--${token}`, value);
      } catch {
        /* Preserve the last applied theme when configuration cannot be read. */
      }
    }
    apply();
    return subscribeConfiguration(apply);
  }, [setTheme]);
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
  const [selected, setSelected] = useState("system");
  const [themes, setThemes] = useState<ImportedTheme[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    function load() {
      try {
        const store = clientConfiguration();
        setSelected(store.getItem("theme") ?? "system");
        setThemes(
          (
            JSON.parse(store.getItem("console.themes.v1") ?? "[]") as unknown[]
          ).map(parseTheme),
        );
        setError(undefined);
      } catch {
        setError("Could not read client appearance.");
      }
    }
    load();
    return subscribeConfiguration(load);
  }, []);
  function select(theme: string) {
    try {
      clientConfiguration().setItem("theme", theme);
      setError(undefined);
    } catch {
      setError("Could not save theme in this browser.");
    }
  }
  function importTheme(value: unknown) {
    const theme = parseTheme(value);
    const current = (
      JSON.parse(
        clientConfiguration().getItem("console.themes.v1") ?? "[]",
      ) as unknown[]
    ).map(parseTheme);
    if (current.length >= 100 && !current.some((item) => item.id === theme.id))
      throw new Error("At most 100 imported themes are supported.");
    clientConfiguration().setItem(
      "console.themes.v1",
      JSON.stringify([
        ...current.filter((item) => item.id !== theme.id),
        theme,
      ]),
    );
  }
  return { selected, themes, error, select, importTheme };
}
