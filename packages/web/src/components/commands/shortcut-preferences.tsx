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
import {
  clientConfiguration,
  subscribeConfiguration,
} from "@/lib/configuration/store";

const Context = createContext<{
  overrides: ShortcutOverrides;
  platform: string;
  ready: boolean;
  storageError: boolean;
  update: (
    id: CommandId,
    value: ShortcutOverrides[CommandId],
  ) => string | undefined;
} | null>(null);

export function ShortcutPreferences({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState("");
  const [overrides, setOverrides] = useState<ShortcutOverrides>({});
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const unsaved = useRef(false);
  useEffect(() => {
    setPlatform(navigator.platform);
    try {
      setOverrides(
        parseShortcuts(clientConfiguration().getItem(shortcutStorageKey)),
      );
    } catch {
      setStorageError(true);
    }
    setReady(true);
    return subscribeConfiguration(() => {
      try {
        setOverrides(
          parseShortcuts(clientConfiguration().getItem(shortcutStorageKey)),
        );
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    });
  }, []);
  function update(id: CommandId, value: ShortcutOverrides[CommandId]) {
    let next = { ...overrides };
    try {
      if (!unsaved.current)
        next = parseShortcuts(
          clientConfiguration().getItem(shortcutStorageKey),
        );
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
      clientConfiguration().setItem(shortcutStorageKey, JSON.stringify(next));
      unsaved.current = false;
      setStorageError(false);
    } catch {
      unsaved.current = true;
      setStorageError(true);
      return "Could not save shortcuts in this browser.";
    }
    setOverrides(next);
  }
  return (
    <Context value={{ overrides, platform, ready, storageError, update }}>
      {children}
    </Context>
  );
}

export function useShortcutPreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("ShortcutPreferences is required.");
  return value;
}
