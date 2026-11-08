"use client";

import { useRef, useState } from "react";
import { useShortcutPreferences } from "@/components/commands/shortcut-preferences";
import { ShortcutTableRow } from "@/components/settings/shortcut-row";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type CommandId,
  commands,
  formatShortcut,
  type Shortcut,
  shortcutConflict,
  shortcutFromEvent,
  shortcutsFor,
} from "@/lib/commands";
import {
  filterShortcutRows,
  type ShortcutEdit,
  type ShortcutRow,
  shortcutRows,
} from "@/lib/shortcut-editor";

export function ShortcutSettings() {
  const { overrides, platform, ready, storageError, update } =
    useShortcutPreferences();
  const [recording, setRecording] = useState<{
    id: CommandId;
    kind: "add" | "replace";
    previous: Shortcut | null;
  }>();
  const [query, setQuery] = useState("");
  const [pageError, setPageError] = useState("");
  const [candidate, setCandidate] = useState<Shortcut>();
  const [captureError, setCaptureError] = useState("");
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const rows = filterShortcutRows(shortcutRows(overrides), query, platform);
  function begin(row: ShortcutRow, kind: "add" | "replace") {
    setCandidate(undefined);
    setCaptureError("");
    setRecording({ id: row.id, kind, previous: row.binding });
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setPageError("");
      setMessage("Copied to clipboard.");
    } catch {
      setPageError(
        "Could not copy to the clipboard. Check your browser permissions.",
      );
    }
  }
  function apply(id: CommandId, value: ShortcutEdit) {
    const error = update(id, value);
    if (error) {
      setCaptureError(error);
      setPageError(error);
    } else {
      setPageError("");
      setRecording(undefined);
      setMessage(`Shortcut updated for ${commands[id].label}.`);
    }
  }
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">Keyboard shortcuts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Shortcuts apply across connected machines. Enter or double-click a row
          to edit; right-click for more actions.
        </p>
      </header>
      {storageError && (
        <p role="alert" className="text-sm text-destructive">
          Browser storage is unavailable. Your last saved shortcuts remain
          active.
        </p>
      )}
      <Input
        aria-label="Search keyboard shortcuts"
        placeholder="Search commands, IDs or keybindings…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Table className="min-w-[38rem]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">
              <span className="sr-only">Actions</span>
            </TableHead>
            <TableHead>Command</TableHead>
            <TableHead>Keybinding</TableHead>
            <TableHead title="Default: built-in configuration. User: browser overrides.">
              Source
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <ShortcutTableRow
              key={`${row.id}:${row.binding ?? "unassigned"}`}
              row={row}
              platform={platform}
              ready={ready}
              customized={overrides[row.id] !== undefined}
              onEdit={() => begin(row, "replace")}
              onAdd={() => begin(row, "add")}
              onRemove={() => {
                if (row.binding)
                  apply(row.id, { kind: "remove", shortcut: row.binding });
              }}
              onReset={() => apply(row.id, { kind: "reset" })}
              onCopy={copy}
            />
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-10 text-center text-muted-foreground"
              >
                No matching commands.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Source shows built-in defaults or your browser overrides. Each binding
        has its own row.
      </p>
      {pageError && (
        <p role="alert" className="text-sm text-destructive">
          {pageError}
        </p>
      )}
      <p role="status" className="text-sm">
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
              recording && shortcutConflict(recording.id, next, overrides);
            setCaptureError(
              conflict
                ? `This shortcut is assigned to ${commands[conflict].label}.`
                : recording &&
                    shortcutsFor(recording.id, overrides).includes(next) &&
                    (recording.kind === "add" || recording.previous !== next)
                  ? "This command already has that keybinding."
                  : "",
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Set keyboard shortcut</DialogTitle>
            <DialogDescription>
              {recording ? commands[recording.id].label : ""}. Press a key
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
                if (recording && candidate)
                  apply(
                    recording.id,
                    recording.kind === "add"
                      ? { kind: "add", shortcut: candidate }
                      : {
                          kind: "replace",
                          previous: recording.previous,
                          shortcut: candidate,
                        },
                  );
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
