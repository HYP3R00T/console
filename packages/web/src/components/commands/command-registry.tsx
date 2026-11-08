"use client";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CommandRegistry,
  type RegisteredCommands,
} from "@/lib/command-registry";
import type { CommandId } from "@/lib/commands";

const Context = createContext<CommandRegistry | null>(null);
export function CommandRegistryProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new CommandRegistry());
  return <Context value={registry}>{children}</Context>;
}
export function useCommands() {
  const registry = useContext(Context),
    route = usePathname();
  if (!registry) throw new Error("CommandRegistryProvider is required.");
  useSyncExternalStore(
    registry.subscribe,
    registry.snapshot,
    registry.snapshot,
  );
  return {
    get: (id: CommandId) => registry.get(id, route),
    invoke: (id: CommandId, input?: unknown) =>
      registry.invoke(id, route, input),
  };
}
export function useRegisterCommands(commands: RegisteredCommands) {
  const registry = useContext(Context),
    route = usePathname();
  const latest = useRef(commands);
  latest.current = commands;
  const signature = JSON.stringify(
    Object.entries(commands).map(([id, handler]) => [id, handler?.disabled]),
  );
  if (!registry) throw new Error("CommandRegistryProvider is required.");
  // Handlers resolve the latest inputs at invocation without re-registering on every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: signature describes registration; latest holds callbacks.
  useLayoutEffect(
    () =>
      registry.register(
        route,
        Object.fromEntries(
          Object.keys(latest.current).map((key) => {
            const id = key as CommandId;
            return [
              id,
              {
                disabled: latest.current[id]?.disabled,
                run: (input?: unknown) => latest.current[id]?.run(input),
              },
            ];
          }),
        ),
      ),
    [registry, route, signature],
  );
}
