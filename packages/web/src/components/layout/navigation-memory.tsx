"use client";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  clientConfiguration,
  subscribeConfiguration,
} from "@/lib/configuration/store";
import {
  emptyNavigationMemory,
  type NavigationMemory,
  navigationMemoryKey,
  parseNavigationMemory,
  workspaceDevice,
} from "@/lib/navigation-memory";

const Context = createContext<{
  memory: NavigationMemory;
  setDisclosure: (key: string, open: boolean) => void;
} | null>(null);

export function NavigationMemoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [memory, setMemory] = useState(emptyNavigationMemory);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setMemory(
        parseNavigationMemory(
          clientConfiguration().getItem(navigationMemoryKey),
        ),
      );
    } catch {
      /* In-memory navigation still works when storage is unavailable. */
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
        clientConfiguration().setItem(
          navigationMemoryKey,
          JSON.stringify(memory),
        );
      } catch {
        /* Keep the current browser session usable without persistence. */
      }
  }, [memory, ready]);
  useEffect(
    () =>
      subscribeConfiguration((imported) => {
        if (imported)
          try {
            setMemory(
              parseNavigationMemory(
                clientConfiguration().getItem(navigationMemoryKey),
              ),
            );
          } catch {
            /* Keep last confirmed navigation. */
          }
      }),
    [],
  );
  return (
    <Context
      value={{
        memory,
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
