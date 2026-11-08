"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useClientAppearance } from "@/components/layout/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  currentThemeDocument,
  downloadTheme,
} from "@/lib/configuration/theme-export";

export function AppearanceSettings() {
  const {
    selected: theme,
    select: setTheme,
    themes,
    importTheme,
    error,
  } = useClientAppearance();
  const [message, setMessage] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold tracking-tight">Appearance</h1>
      <section
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border px-6 py-5"
        aria-label="Appearance settings"
      >
        <h2 className="text-sm font-medium">Theme</h2>
        <ToggleGroup
          aria-label="Color theme"
          variant="outline"
          spacing={0}
          multiple={false}
          disabled={!mounted}
          value={mounted ? [theme ?? "system"] : []}
          onValueChange={(values) => {
            if (values[0]) setTheme(values[0]);
          }}
        >
          <ToggleGroupItem value="system" aria-label="System theme">
            <Monitor />
            System
          </ToggleGroupItem>
          <ToggleGroupItem value="light" aria-label="Light theme">
            <Sun />
            Light
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="Dark theme">
            <Moon />
            Dark
          </ToggleGroupItem>
        </ToggleGroup>
      </section>
      <section aria-label="Theme files" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Theme files</h2>
        <p className="text-sm text-muted-foreground">
          Download a complete example to edit, or export the theme currently
          displayed. Both files can be imported below.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a
                href="/themes/example.json"
                download="console-theme-example.json"
              />
            }
          >
            Download sample theme
          </Button>
          <Button
            variant="outline"
            disabled={!mounted}
            onClick={() => {
              try {
                downloadTheme(
                  currentThemeDocument(
                    document.documentElement,
                    themes.find((item) => item.id === theme),
                  ),
                );
                setMessage("Current theme exported.");
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Theme export failed.",
                );
              }
            }}
          >
            Export current theme
          </Button>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer">Theme JSON structure</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            <code>
              {JSON.stringify(
                {
                  id: "custom-my-theme",
                  name: "My Theme",
                  mode: "dark",
                  tokens: {
                    background: "#18181b",
                    foreground: "#fafafa",
                    primary: "#60a5fa",
                    "primary-foreground": "#18181b",
                  },
                },
                null,
                2,
              )}
            </code>
          </pre>
          <p className="mt-2 text-muted-foreground">
            IDs start with custom-. Use light or dark for the base, then
            override its colors. The sample download lists every supported
            token.
          </p>
        </details>
      </section>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="theme-file">Import theme</FieldLabel>
          <Input
            id="theme-file"
            type="file"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                if (file.size > 65536)
                  throw new Error("Theme files must be smaller than 64 KB.");
                importTheme(JSON.parse(await file.text()));
                setMessage("Theme imported. Select it below to apply.");
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Theme import failed.",
                );
              }
            }}
          />
          <FieldDescription>
            JSON: id (custom-name), name, mode (light/dark), and tokens mapping
            supported color names to #RRGGBB values.
          </FieldDescription>
        </Field>
        {themes.length > 0 && (
          <Field>
            <FieldLabel htmlFor="custom-theme">Imported themes</FieldLabel>
            <select
              id="custom-theme"
              className="rounded-md border border-input bg-background p-2"
              value={themes.some((item) => item.id === theme) ? theme : ""}
              onChange={(event) => {
                if (event.target.value) setTheme(event.target.value);
              }}
            >
              <option value="">Choose an imported theme</option>
              {themes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </FieldGroup>
      <p role="status" className="text-sm">
        {error ?? message}
      </p>
    </div>
  );
}
