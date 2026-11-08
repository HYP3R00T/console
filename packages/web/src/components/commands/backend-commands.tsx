"use client";
import type { CommandCatalog } from "@console/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useConnection } from "@/components/connection-provider";
import { BackendRequestError } from "@/lib/backend/client";
import {
  type BackendCommandId,
  backendOperations,
} from "@/lib/backend/commands";

type Discovery = {
  status: "loading" | "legacy" | "ready" | "error";
  ids: string[];
  error?: string;
};
const Context = createContext<
  | (Discovery & {
      retry: () => void;
      supports: (id: BackendCommandId) => boolean;
    })
  | null
>(null);
export function BackendCommandsProvider({ children }: { children: ReactNode }) {
  const { client } = useConnection();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    client: typeof client;
    data: Discovery;
  }>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries discovery for the same client.
  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    void client
      .request<CommandCatalog>("/v1/commands", { signal: controller.signal })
      .then((catalog) => {
        if (
          catalog.version !== 1 ||
          !Array.isArray(catalog.commands) ||
          catalog.commands.some(
            (item) =>
              !item ||
              typeof item.id !== "string" ||
              typeof item.path !== "string" ||
              typeof item.method !== "string" ||
              !item.inputSchema ||
              typeof item.inputSchema !== "object" ||
              !["machine", "project", "session", "conversation"].includes(
                item.scope,
              ),
          )
        )
          throw new Error("Invalid command catalog.");
        const ids = catalog.commands
          .filter((command) => {
            const operation = backendOperations[command.id as BackendCommandId];
            return (
              operation &&
              operation[0] === command.method &&
              operation[1] === command.path
            );
          })
          .map((command) => command.id);
        if (!controller.signal.aborted)
          setResult({ client, data: { status: "ready", ids } });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            client,
            data:
              error instanceof BackendRequestError && error.status === 404
                ? { status: "legacy", ids: [] }
                : {
                    status: "error",
                    ids: [],
                    error:
                      error instanceof Error
                        ? error.message
                        : "Command discovery failed.",
                  },
          });
      });
    return () => controller.abort();
  }, [client, attempt]);
  const data: Discovery =
    client && result?.client === client
      ? result.data
      : { status: "loading", ids: [] };
  const retry = useCallback(() => {
    setResult(undefined);
    setAttempt((value) => value + 1);
  }, []);
  return (
    <Context
      value={{
        ...data,
        retry,
        supports: (id) => data.status === "ready" && data.ids.includes(id),
      }}
    >
      {children}
    </Context>
  );
}
export function useBackendCommands() {
  const value = useContext(Context);
  if (!value) throw new Error("BackendCommandsProvider is required.");
  return value;
}
