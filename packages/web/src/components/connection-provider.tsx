"use client";

import { useParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { BackendConnector } from "../lib/backend/client.ts";
import {
  ConnectionManager,
  type ConnectionState,
  disconnected,
} from "../lib/backend/connection-manager.ts";
import { localHttpConnector } from "../lib/backend/local-http.ts";

const Context = createContext<{
  manager: ConnectionManager;
  states: Readonly<Record<string, ConnectionState>>;
} | null>(null);
const empty: Readonly<Record<string, ConnectionState>> = {};
export function ConnectionProvider({
  children,
  connector = localHttpConnector,
}: {
  children: ReactNode;
  connector?: BackendConnector;
}) {
  const [manager] = useState(() => new ConnectionManager(connector));
  const states = useSyncExternalStore(
    manager.subscribe,
    manager.snapshot,
    () => empty,
  );
  useEffect(() => () => manager.close(), [manager]);
  return <Context value={{ manager, states }}>{children}</Context>;
}
export function useConnections() {
  const value = useContext(Context);
  if (!value) throw new Error("ConnectionProvider is required");
  return value;
}
export function useConnection(id?: string) {
  const { deviceId } = useParams<{ deviceId?: string }>();
  const { states } = useConnections();
  return states[id ?? deviceId ?? ""] ?? disconnected;
}
