"use client";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  clientConfiguration,
  subscribeConfiguration,
} from "@/lib/configuration/store";
import type { InspectorSelection } from "@/lib/inspector-preferences";
import {
  emptyNavigationMemory,
  type NavigationMemory,
  navigationMemoryKey,
  parseNavigationMemory,
  workspaceDevice,
} from "@/lib/navigation-memory";

const Context = createContext<{
  memory: NavigationMemory;
  storageError: boolean;
  setInspectorSelection: (key: string, value: InspectorSelection) => void;
  setDisclosure: (key: string, open: boolean) => void;
} | null>(null);

export function NavigationMemoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [memory, setMemory] = useState(emptyNavigationMemory);
  const [storageError, setStorageError] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setMemory(
        parseNavigationMemory(
          clientConfiguration().getItem(navigationMemoryKey),
        ),
      );
    } catch {
      setStorageError(true);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const id = workspaceDevice(pathname);
    if (id)
      setMemory((current) =>
        current.routes[id] === pathname
          ? current
          : { ...current, routes: { ...current.routes, [id]: pathname } },
      );
  }, [pathname, ready]);
  useEffect(() => {
    if (ready)
      try {
        const serialized = JSON.stringify(memory);
        if (clientConfiguration().getItem(navigationMemoryKey) !== serialized)
          clientConfiguration().setItem(navigationMemoryKey, serialized);
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
  }, [memory, ready]);
  useEffect(
    () =>
      subscribeConfiguration(() => {
        try {
          const next = parseNavigationMemory(
            clientConfiguration().getItem(navigationMemoryKey),
          );
          setMemory((current) =>
            JSON.stringify(current) === JSON.stringify(next) ? current : next,
          );
        } catch {
          setStorageError(true);
        }
      }),
    [],
  );
  const setInspectorSelection = useCallback(
    (key: string, value: InspectorSelection) =>
      setMemory((current) => ({
        ...current,
        inspectors: { ...current.inspectors, [key]: value },
      })),
    [],
  );
  return (
    <Context
      value={{
        memory,
        storageError,
        setInspectorSelection,
        setDisclosure: (key, open) =>
          setMemory((current) => ({
            ...current,
            disclosures: { ...current.disclosures, [key]: open },
          })),
      }}
    >
      {children}
    </Context>
  );
}

export function useNavigationMemory() {
  const value = useContext(Context);
  if (!value) throw new Error("NavigationMemoryProvider is required.");
  return value;
}
export function useNavigationDisclosure(key: string, fallback: boolean) {
  const { memory, setDisclosure } = useNavigationMemory();
  return [
    memory.disclosures[key] ?? fallback,
    (open: boolean) => setDisclosure(key, open),
  ] as const;
}
