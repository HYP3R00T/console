"use client";

import { useRef, useState } from "react";
import { useShortcutPreferences } from "@/components/commands/shortcut-preferences";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  type CommandId,
  commandIds,
  commands,
  formatShortcut,
  type Shortcut,
  shortcutConflict,
  shortcutFor,
  shortcutFromEvent,
} from "@/lib/commands";

export function ShortcutSettings() {
  const { overrides, platform, ready, storageError, update } =
    useShortcutPreferences();
  const [recording, setRecording] = useState<CommandId>();
  const [candidate, setCandidate] = useState<Shortcut>();
  const [captureError, setCaptureError] = useState("");
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function apply(id: CommandId, value: Parameters<typeof update>[1]) {
    const error = update(id, value);
    if (error) {
      setCaptureError(error);
      setMessage(error);
    } else {
      setRecording(undefined);
      setMessage(`Shortcut updated for ${commands[id].label}.`);
    }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">Keyboard shortcuts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Shortcuts apply in this browser across all connected machines. Use{" "}
          {formatShortcut("Mod+K", platform).split(" + ")[0]} or Alt with a key,
          and optionally Shift. Punctuation such as a comma is supported.
        </p>
      </header>
      {storageError && (
        <p role="alert" className="text-sm text-destructive">
          Browser storage is unavailable. Your last saved shortcuts remain
          active.
        </p>
      )}
      <ul className="divide-y">
        {commandIds.map((id) => {
          const label = commands[id].label,
            shortcut = shortcutFor(id, overrides);
          return (
            <li
              key={id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span className="text-sm">{label}</span>
              <div className="flex flex-wrap items-center gap-2">
                <kbd className="text-xs text-muted-foreground">
                  {formatShortcut(shortcut, platform)}
                </kbd>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!ready}
                  aria-label={`Change shortcut for ${label}`}
                  onClick={() => {
                    setCandidate(undefined);
                    setCaptureError("");
                    setRecording(id);
                  }}
                >
                  Change
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
      <Dialog
        open={!!recording}
        onOpenChange={(open) => {
          if (!open) setRecording(undefined);
        }}
      >
        <DialogContent
          initialFocus={input}
          onKeyDownCapture={(event) => {
            if (event.target !== input.current) return;
            if (
              event.key === "Tab" ||
              event.key === "Escape" ||
              event.nativeEvent.isComposing
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            if (
              event.repeat ||
              ["Control", "Meta", "Alt", "Shift"].includes(event.key)
            )
              return;
            const next = shortcutFromEvent(event.nativeEvent);
            setCandidate(next);
            if (!next) {
              setCaptureError(
                "Use Ctrl or Command, or Alt, with a key. Standard editing shortcuts are reserved.",
              );
              return;
            }
            const conflict =
              recording && shortcutConflict(recording, next, overrides);
            setCaptureError(
              conflict
                ? `This shortcut is assigned to ${commands[conflict].label}.`
                : "",
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Set keyboard shortcut</DialogTitle>
            <DialogDescription>
              {recording ? commands[recording].label : ""}. Press a key
              combination, then save. Escape cancels.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={!!captureError}>
              <FieldLabel htmlFor="shortcut-recording">
                Recorded shortcut
              </FieldLabel>
              <Input
                ref={input}
                id="shortcut-recording"
                readOnly
                value={candidate ? formatShortcut(candidate, platform) : ""}
                placeholder="Press your shortcut…"
                aria-invalid={!!captureError}
                aria-describedby="shortcut-recording-help"
              />
              <FieldDescription id="shortcut-recording-help">
                Some combinations are reserved by your browser or operating
                system.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {captureError && (
            <p role="alert" className="text-sm text-destructive">
              {captureError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecording(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={!candidate || !!captureError}
              onClick={() => {
                if (recording && candidate) apply(recording, candidate);
              }}
            >
              Save shortcut
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
