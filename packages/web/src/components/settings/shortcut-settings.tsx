"use client";

import { useState } from "react";
import { useShortcutPreferences } from "@/components/commands/shortcut-preferences";
import { Button } from "@/components/ui/button";
import {
  type CommandId,
  commandIds,
  commands,
  shortcutFor,
  shortcutFromEvent,
} from "@/lib/commands";

export function ShortcutSettings() {
  const { overrides, ready, storageError, update } = useShortcutPreferences();
  const [recording, setRecording] = useState<CommandId>();
  const [message, setMessage] = useState("");
  function apply(id: CommandId, value: Parameters<typeof update>[1]) {
    const error = update(id, value);
    if (!error) setRecording(undefined);
    setMessage(error ?? `Shortcut updated for ${commands[id].label}.`);
  }
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">Keyboard shortcuts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Shortcuts apply in this browser. Mod means Ctrl or Command. Use a
          letter or digit and add Shift or Alt if needed.
        </p>
      </header>
      {storageError && (
        <p role="alert" className="text-sm text-destructive">
          Browser storage is unavailable. Shortcut changes apply until you
          reload.
        </p>
      )}
      <ul className="divide-y">
        {commandIds.map((id) => {
          const label = commands[id].label;
          const shortcut = shortcutFor(id, overrides);
          const active = recording === id;
          return (
            <li
              key={id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span className="text-sm">{label}</span>
              <div className="flex flex-wrap items-center gap-2">
                <kbd className="text-xs text-muted-foreground">
                  {shortcut ?? "Unassigned"}
                </kbd>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!ready}
                  aria-label={
                    active
                      ? `Recording shortcut for ${label}`
                      : `Change shortcut for ${label}`
                  }
                  onClick={() => {
                    setRecording(active ? undefined : id);
                    setMessage(
                      active
                        ? ""
                        : "Press the new shortcut, or Escape to cancel.",
                    );
                  }}
                  onBlur={() => {
                    if (active) setRecording(undefined);
                  }}
                  onKeyDown={(event) => {
                    if (!active || event.key === "Tab") return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      setRecording(undefined);
                      setMessage("Shortcut recording cancelled.");
                      return;
                    }
                    if (event.repeat) return;
                    const next = shortcutFromEvent(event.nativeEvent);
                    if (next) apply(id, next);
                    else if (event.key.length === 1)
                      setMessage(
                        "Choose an available Ctrl or Command shortcut.",
                      );
                  }}
                >
                  {active ? "Press shortcut…" : "Change"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!ready || !shortcut}
                  aria-label={`Remove shortcut for ${label}`}
                  onClick={() => apply(id, null)}
                >
                  Remove
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!ready || overrides[id] === undefined}
                  aria-label={`Reset shortcut for ${label}`}
                  onClick={() => apply(id, undefined)}
                >
                  Reset
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p role="status" className="sticky bottom-0 bg-background text-sm">
        {message}
      </p>
    </div>
  );
}
