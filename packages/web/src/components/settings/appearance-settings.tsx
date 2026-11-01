"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold tracking-tight">Appearance</h1>
      <section
        className="flex flex-wrap items-center justify-between gap-4 border px-6 py-5"
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
    </div>
  );
}
