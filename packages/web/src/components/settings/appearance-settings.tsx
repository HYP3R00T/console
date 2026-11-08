"use client";
import { Monitor, Moon, Sun, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useClientAppearance } from "@/components/layout/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ImportedTheme } from "@/lib/configuration/store";
import { groupThemeFamilies } from "@/lib/configuration/theme-gallery";
import { cn } from "@/lib/utils";
import { ThemeColorsDialog } from "./theme-colors-dialog";
import { ThemeFamilyCard } from "./theme-family-card";

export function AppearanceSettings() {
  const {
    appearance,
    activeMode,
    themes,
    setMode,
    select,
    importTheme,
    error,
    ready,
  } = useClientAppearance();
  const [inspected, setInspected] = useState<ImportedTheme>();
  const [message, setMessage] = useState("");
  const [importError, setImportError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  async function importFiles(files: File[]) {
    setImportError(undefined);
    setMessage("");
    if (files.length !== 1) {
      setImportError("Choose one theme JSON file at a time.");
      return;
    }
    setReading(true);
    try {
      const file = files[0];
      if (file.size > 65536)
        throw new Error("Theme files must be smaller than 64 KB.");
      const imported = importTheme(JSON.parse(await file.text()));
      setMessage(
        `${imported.name} imported. Choose it in ${imported.mode} themes.`,
      );
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Theme import failed.",
      );
    } finally {
      setReading(false);
    }
  }
  return (
    <div className="@container flex w-full flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-sm text-muted-foreground">
          Choose a theme for each mode. System follows your device’s light or
          dark appearance.
        </p>
      </header>
      <section
        aria-label="Display mode"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <h2 className="text-sm font-medium">Display mode</h2>
        <ToggleGroup
          aria-label="Display mode"
          variant="outline"
          spacing={0}
          multiple={false}
          disabled={!ready}
          value={ready ? [appearance.mode] : []}
          onValueChange={(values) => {
            if (
              values[0] === "system" ||
              values[0] === "light" ||
              values[0] === "dark"
            )
              setMode(values[0]);
          }}
        >
          <ToggleGroupItem value="system">
            <Monitor />
            System
          </ToggleGroupItem>
          <ToggleGroupItem value="light">
            <Sun />
            Light
          </ToggleGroupItem>
          <ToggleGroupItem value="dark">
            <Moon />
            Dark
          </ToggleGroupItem>
        </ToggleGroup>
      </section>
      {(["light", "dark"] as const).map((mode) => {
        const selected =
          mode === "dark" ? appearance.darkTheme : appearance.lightTheme;
        return (
          <section
            key={mode}
            aria-label={`${mode} themes`}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">
                {mode === "light" ? "Light themes" : "Dark themes"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {activeMode === mode
                  ? "Active mode · selections apply immediately"
                  : `Saved for ${mode} mode`}
              </p>
            </div>
            <ToggleGroup
              aria-label={`Default ${mode} theme`}
              multiple={false}
              value={ready ? [selected] : []}
              disabled={!ready}
              onValueChange={(values) => {
                if (values[0]) select(mode, values[0]);
              }}
              className="grid! w-full grid-cols-1 items-start gap-5 @xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4"
            >
              {groupThemeFamilies(themes, mode).map((family) => (
                <ThemeFamilyCard
                  key={`${mode}:${family.id}`}
                  family={family}
                  selected={selected}
                  disabled={!ready}
                  onSelect={(id) => select(mode, id)}
                  onInspect={setInspected}
                  onMessage={setMessage}
                  onError={setImportError}
                />
              ))}
            </ToggleGroup>
          </section>
        );
      })}
      <section
        aria-label="Import themes"
        onDragOver={(event) => {
          event.preventDefault();
          if (!reading) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!reading && ready)
            void importFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center",
          dragging && "bg-muted",
        )}
      >
        <Upload aria-hidden="true" className="size-5 text-muted-foreground" />
        <h2 className="text-sm font-medium">Import themes</h2>
        <p className="text-sm text-muted-foreground">
          Drop a theme JSON file here, or choose a file.
        </p>
        <Input
          ref={fileInput}
          id="theme-file"
          type="file"
          accept=".json,application/json"
          aria-label="Theme JSON file"
          className="sr-only"
          tabIndex={-1}
          disabled={!ready || reading}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) void importFiles(files);
          }}
        />
        <Button
          variant="outline"
          disabled={!ready || reading}
          onClick={() => fileInput.current?.click()}
        >
          {reading ? "Importing…" : "Choose file"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Up to 64 KB. Download any theme above as a starting point.
        </p>
      </section>
      <ThemeColorsDialog
        theme={inspected}
        onClose={() => setInspected(undefined)}
      />
      {(error || importError) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? importError}
        </p>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
