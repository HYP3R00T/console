"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type CommandId,
  commands,
  defaultShortcut,
  parseShortcuts,
  type ShortcutOverrides,
  shortcutConflict,
  shortcutStorageKey,
} from "@/lib/commands";

const Context = createContext<{
  overrides: ShortcutOverrides;
  ready: boolean;
  storageError: boolean;
  update: (
    id: CommandId,
    value: ShortcutOverrides[CommandId],
  ) => string | undefined;
} | null>(null);

export function ShortcutPreferences({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<ShortcutOverrides>({});
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const unsaved = useRef(false);
  useEffect(() => {
    try {
      setOverrides(parseShortcuts(localStorage.getItem(shortcutStorageKey)));
    } catch {
      setStorageError(true);
    }
    setReady(true);
    function sync(event: StorageEvent) {
      if (
        event.storageArea === localStorage &&
        !unsaved.current &&
        (event.key === shortcutStorageKey || event.key === null)
      ) {
        setOverrides(parseShortcuts(event.newValue));
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function update(id: CommandId, value: ShortcutOverrides[CommandId]) {
    let next = { ...overrides };
    try {
      if (!unsaved.current)
        next = parseShortcuts(localStorage.getItem(shortcutStorageKey));
    } catch {
      setStorageError(true);
    }
    const shortcut = value === undefined ? defaultShortcut(id) : value;
    const conflict = shortcut && shortcutConflict(id, shortcut, next);
    if (conflict)
      return `This shortcut is assigned to ${commands[conflict].label}.`;
    if (value === undefined) delete next[id];
    else next[id] = value;
    try {
      localStorage.setItem(shortcutStorageKey, JSON.stringify(next));
      unsaved.current = false;
      setStorageError(false);
    } catch {
      unsaved.current = true;
      setStorageError(true);
    }
    setOverrides(next);
  }
  return (
    <Context value={{ overrides, ready, storageError, update }}>
      {children}
    </Context>
  );
}

export function useShortcutPreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("ShortcutPreferences is required.");
  return value;
}
