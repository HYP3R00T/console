import {
  type CommandId,
  commandIds,
  commands,
  formatShortcut,
  isShortcut,
  type Shortcut,
  type ShortcutOverrides,
  shortcutConflict,
  shortcutsFor,
} from "./commands.ts";

export type ShortcutEdit =
  | { kind: "add"; shortcut: Shortcut }
  | { kind: "replace"; previous: Shortcut | null; shortcut: Shortcut }
  | { kind: "remove"; shortcut: Shortcut }
  | { kind: "reset" };

/** Apply against the latest saved bindings so edits never replace unseen alternatives. */
export function editShortcut(
  id: CommandId,
  edit: ShortcutEdit,
  overrides: ShortcutOverrides,
): ShortcutOverrides {
  const next = { ...overrides };
  const bindings = shortcutsFor(id, overrides);
  if (edit.kind === "reset") delete next[id];
  else {
    if (edit.kind !== "remove" && !isShortcut(edit.shortcut))
      throw new Error("Invalid keyboard shortcut.");
    if (edit.kind === "add") {
      if (bindings.includes(edit.shortcut))
        throw new Error("This command already has that keybinding.");
      bindings.push(edit.shortcut);
    } else if (edit.kind === "replace") {
      const index =
        edit.previous === null ? -1 : bindings.indexOf(edit.previous);
      if (
        (edit.previous === null && bindings.length > 0) ||
        (edit.previous !== null && index < 0)
      )
        throw new Error(
          "Keybindings changed elsewhere. Reopen the editor and try again.",
        );
      if (
        bindings.some((binding, i) => binding === edit.shortcut && i !== index)
      )
        throw new Error("This command already has that keybinding.");
      if (index < 0) bindings.push(edit.shortcut);
      else bindings[index] = edit.shortcut;
    } else {
      const index = bindings.indexOf(edit.shortcut);
      if (index < 0)
        throw new Error(
          "Keybindings changed elsewhere. Refresh and try again.",
        );
      bindings.splice(index, 1);
    }
    next[id] = bindings.length > 1 ? bindings : (bindings[0] ?? null);
  }
  for (const binding of shortcutsFor(id, next)) {
    const conflict = shortcutConflict(id, binding, next);
    if (conflict)
      throw new Error(
        `This shortcut is assigned to ${commands[conflict].label}.`,
      );
  }
  return next;
}
export type ShortcutRow = {
  id: CommandId;
  binding: Shortcut | null;
  source: "Default" | "User";
};
export function shortcutRows(overrides: ShortcutOverrides): ShortcutRow[] {
  return [...commandIds]
    .sort((a, b) => commands[a].label.localeCompare(commands[b].label))
    .flatMap((id) => {
      const bindings = shortcutsFor(id, overrides);
      return (bindings.length ? bindings : [null]).map((binding) => ({
        id,
        binding,
        source:
          overrides[id] === undefined
            ? ("Default" as const)
            : ("User" as const),
      }));
    });
}
export function filterShortcutRows(
  rows: ShortcutRow[],
  query: string,
  platform: string,
) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    const text = [
      commands[row.id].label,
      row.id,
      row.binding ?? "",
      formatShortcut(row.binding, platform),
      row.source,
    ]
      .join(" ")
      .toLowerCase();
    return words.every(
      (word) => text.includes(word) || text.replace(/\s+/g, "").includes(word),
    );
  });
}
