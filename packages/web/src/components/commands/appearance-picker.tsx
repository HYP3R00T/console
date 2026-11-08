"use client";
import { ArrowLeft, Monitor, Moon, Palette, Sun } from "lucide-react";
import { type RefObject, useEffect, useLayoutEffect, useState } from "react";
import { useClientAppearance } from "@/components/layout/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  AppearanceCommandId,
  AppearancePicker,
} from "@/lib/configuration/appearance-command";
import { themePreview } from "@/lib/configuration/theme-preview";
import { completeTheme } from "@/lib/configuration/themes";
import { paletteSearchScore, rankPaletteResults } from "@/lib/palette-search";

export function AppearancePickerView({
  picker,
  commandId,
  initialValue,
  inputRef,
  onBack,
  onApply,
}: {
  picker: AppearancePicker;
  commandId: AppearanceCommandId;
  initialValue: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onApply: (id: AppearanceCommandId, input: unknown) => unknown;
}) {
  const { appearance, themes, activeMode, ready } = useClientAppearance();
  const [owner] = useState(() => Symbol("palette-theme-preview"));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(initialValue);
  const [error, setError] = useState("");
  const choices =
    picker.kind === "theme"
      ? rankPaletteResults(
          themes
            .filter((theme) => theme.mode === picker.mode)
            .map(completeTheme),
          (theme) =>
            paletteSearchScore(
              query,
              [theme.name],
              [theme.id.startsWith("custom-") ? "Imported" : "Built-in"],
            ),
        )
      : [];
  const saved = !ready
    ? initialValue
    : picker.kind === "mode"
      ? appearance.mode
      : picker.mode === "dark"
        ? appearance.darkTheme
        : appearance.lightTheme;
  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);
  useEffect(() => () => themePreview.clear(owner), [owner]);
  const highlighted = choices.find((theme) => theme.id === selected);
  useEffect(() => {
    if (ready && !error && picker.kind === "theme" && highlighted)
      themePreview.show(owner, highlighted.id, picker.mode);
    else themePreview.clear(owner);
  }, [highlighted, owner, picker, ready, error]);
  const modeChoices = (
    [
      {
        id: "system",
        label: "System",
        detail: "Follow your device’s appearance",
        Icon: Monitor,
      },
      {
        id: "light",
        label: "Light",
        detail: "Use your saved light theme",
        Icon: Sun,
      },
      {
        id: "dark",
        label: "Dark",
        detail: "Use your saved dark theme",
        Icon: Moon,
      },
    ] as const
  ).filter((item) => paletteSearchScore(query, [item.label, item.detail]) > 0);
  const choiceIds: string[] =
    picker.kind === "theme"
      ? choices.map((item) => item.id)
      : modeChoices.map((item) => item.id);
  const selectedExists = choiceIds.includes(selected),
    firstChoice = choiceIds[0];
  useLayoutEffect(() => {
    if (ready && !selectedExists) setSelected(firstChoice ?? "");
  }, [ready, selectedExists, firstChoice]);
  function apply(value: unknown) {
    if (!ready) return;
    try {
      onApply(commandId, value);
      setError("");
    } catch (cause) {
      themePreview.clear(owner);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save appearance. Saved preferences are unchanged.",
      );
    }
  }
  return (
    <Command
      shouldFilter={false}
      value={selected}
      onValueChange={(value) => {
        if (!ready) return;
        setSelected(value);
        setError("");
      }}
      className="min-h-0"
    >
      <header className="flex min-h-12 shrink-0 items-center gap-2 px-3 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back to command palette"
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <Palette className="size-4 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            {picker.kind === "mode"
              ? "Display mode"
              : `${picker.mode === "dark" ? "Dark" : "Light"} theme`}
          </h2>
          <p className="text-xs text-foreground/80">
            {picker.kind === "mode"
              ? "Choose how Console follows your device."
              : picker.mode === activeMode
                ? "Arrow keys preview · Enter saves · Escape cancels"
                : `Set the default for ${picker.mode} mode. The current ${activeMode} appearance stays unchanged.`}
          </p>
        </div>
      </header>
      <CommandInput
        ref={inputRef}
        aria-label={
          picker.kind === "mode" ? "Search display modes" : "Search themes"
        }
        placeholder={
          picker.kind === "mode"
            ? "System, Light or Dark…"
            : "Search built-in and imported themes…"
        }
        value={query}
        onValueChange={(value) => {
          setQuery(value);
          setSelected("");
          setError("");
        }}
      />
      <ScrollArea className="h-[min(55svh,28rem)] min-h-0">
        <CommandList className="max-h-none overflow-visible px-3 py-2">
          <CommandEmpty>
            No matching {picker.kind === "mode" ? "display modes" : "themes"}.
          </CommandEmpty>
          {picker.kind === "theme" ? (
            <CommandGroup heading="Themes" emphasis>
              {choices.map((theme) => (
                <CommandItem
                  key={theme.id}
                  value={theme.id}
                  disabled={!ready}
                  onSelect={() =>
                    apply({ mode: picker.mode, themeId: theme.id })
                  }
                  data-checked={theme.id === saved}
                >
                  <span className="flex gap-1" aria-hidden="true">
                    {["background", "foreground", "primary", "destructive"].map(
                      (token) => (
                        <span
                          key={token}
                          className="size-3 rounded-sm border"
                          style={{
                            backgroundColor:
                              theme.tokens[token as keyof typeof theme.tokens],
                          }}
                        />
                      ),
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {theme.name}
                  </span>
                  {theme.id.startsWith("custom-") && (
                    <span className="text-xs text-foreground/80">Imported</span>
                  )}
                  <span className="text-xs text-foreground/80">
                    {theme.id === saved
                      ? "Saved"
                      : theme.id === selected && picker.mode === activeMode
                        ? "Preview"
                        : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : (
            <CommandGroup heading="Display mode" emphasis>
              {modeChoices.map(({ id, label, detail, Icon }) => (
                <CommandItem
                  key={id}
                  value={id}
                  disabled={!ready}
                  onSelect={() => apply(id)}
                  data-checked={saved === id}
                >
                  <Icon />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">
                      {label}
                    </span>
                    <span className="text-foreground/80">{detail}</span>
                  </span>
                  {saved === id && (
                    <span className="text-foreground/80">Saved</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </ScrollArea>
      <footer className="border-t px-3 py-2 text-xs text-foreground/80">
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <p>
            Changes are saved only when you select a choice. Back or Escape
            cancels the preview.
          </p>
        )}
      </footer>
    </Command>
  );
}
