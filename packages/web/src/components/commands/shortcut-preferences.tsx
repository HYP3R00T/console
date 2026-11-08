"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  type CommandId,
  parseShortcuts,
  type ShortcutOverrides,
  shortcutStorageKey,
} from "@/lib/commands";
import {
  clientConfiguration,
  subscribeConfiguration,
} from "@/lib/configuration/store";
import { editShortcut, type ShortcutEdit } from "@/lib/shortcut-editor";

const Context = createContext<{
  overrides: ShortcutOverrides;
  platform: string;
  ready: boolean;
  storageError: boolean;
  update: (id: CommandId, edit: ShortcutEdit) => string | undefined;
} | null>(null);

export function ShortcutPreferences({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState("");
  const [overrides, setOverrides] = useState<ShortcutOverrides>({});
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
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
  function update(id: CommandId, edit: ShortcutEdit) {
    let latest: ShortcutOverrides;
    try {
      latest = parseShortcuts(
        clientConfiguration().getItem(shortcutStorageKey),
      );
    } catch {
      setStorageError(true);
      return "Could not read shortcuts from browser storage.";
    }
    let next: ShortcutOverrides;
    try {
      next = editShortcut(id, edit, latest);
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid shortcut.";
    }
    try {
      clientConfiguration().setItem(shortcutStorageKey, JSON.stringify(next));
    } catch {
      setStorageError(true);
      return "Could not save shortcuts in this browser. Saved bindings are unchanged.";
    }
    setOverrides(next);
    setStorageError(false);
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
