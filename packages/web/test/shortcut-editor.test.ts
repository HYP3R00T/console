import assert from "node:assert/strict";
import test from "node:test";
import { parseShortcuts, shortcutsFor } from "../src/lib/commands.ts";
import {
  editShortcut,
  filterShortcutRows,
  shortcutRows,
} from "../src/lib/shortcut-editor.ts";

test("multiple bindings retain defaults, change independently and reset as a command", () => {
  const original = {};
  const added = editShortcut(
    "palette.open",
    { kind: "add", shortcut: "Alt+P" },
    original,
  );
  assert.deepEqual(shortcutsFor("palette.open", added), ["Mod+K", "Alt+P"]);
  assert.deepEqual(original, {});
  const changed = editShortcut(
    "palette.open",
    { kind: "replace", previous: "Alt+P", shortcut: "Alt+Shift+P" },
    added,
  );
  assert.deepEqual(shortcutsFor("palette.open", changed), [
    "Mod+K",
    "Alt+Shift+P",
  ]);
  const removed = editShortcut(
    "palette.open",
    { kind: "remove", shortcut: "Mod+K" },
    changed,
  );
  assert.deepEqual(shortcutsFor("palette.open", removed), ["Alt+Shift+P"]);
  const empty = editShortcut(
    "palette.open",
    { kind: "remove", shortcut: "Alt+Shift+P" },
    removed,
  );
  assert.equal(empty["palette.open"], null);
  assert.deepEqual(editShortcut("palette.open", { kind: "reset" }, empty), {});
});
test("edits preserve unseen alternatives and reject stale targets, duplicates and reset conflicts", () => {
  const latest = editShortcut(
    "palette.open",
    { kind: "add", shortcut: "Alt+P" },
    {},
  );
  assert.deepEqual(
    shortcutsFor(
      "palette.open",
      editShortcut(
        "palette.open",
        { kind: "replace", previous: "Mod+K", shortcut: "Alt+K" },
        latest,
      ),
    ),
    ["Alt+K", "Alt+P"],
  );
  assert.throws(
    () =>
      editShortcut(
        "palette.open",
        { kind: "replace", previous: "Alt+X", shortcut: "Alt+K" },
        latest,
      ),
    /changed elsewhere/,
  );
  assert.throws(
    () =>
      editShortcut("palette.open", { kind: "add", shortcut: "Alt+P" }, latest),
    /already/,
  );
  assert.throws(
    () =>
      editShortcut(
        "settings.open",
        { kind: "replace", previous: null, shortcut: "Alt+P" },
        latest,
      ),
    /assigned/,
  );
  assert.throws(
    () =>
      editShortcut(
        "palette.open",
        { kind: "reset" },
        { "palette.open": null, "settings.open": "Mod+K" },
      ),
    /assigned/,
  );
});
test("storage parsing accepts legacy and multiple bindings and rejects ambiguous assignments", () => {
  const saved = {
    "palette.open": ["Mod+K", "Alt+P"],
    "conversation.new": "Alt+N",
  };
  assert.deepEqual(parseShortcuts(JSON.stringify(saved)), saved);
  for (const bindings of [
    ["Alt+P", "Alt+P"],
    ["Alt+P", "Mod+V"],
    ["Alt+P", "Mod+B"],
  ]) {
    assert.deepEqual(
      parseShortcuts(JSON.stringify({ "palette.open": bindings })),
      {},
    );
  }
});
test("table rows expose ownership and filter by titles, IDs, platform keys and source", () => {
  const rows = shortcutRows({ "palette.open": ["Mod+K", "Alt+P"] });
  assert.equal(rows.filter((row) => row.id === "palette.open").length, 2);
  for (const query of ["Ctrl+K", "palette.open Ctrl", "command palette User"])
    assert.equal(
      filterShortcutRows(rows, query, "Linux")[0]?.id,
      "palette.open",
    );
  assert.equal(filterShortcutRows(rows, "no-such-command", "Linux").length, 0);
  assert.equal(
    rows.find((row) => row.id === "settings.open")?.source,
    "Default",
  );
});
