"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { BackendClient, BackendConnector } from "../lib/backend/client.ts";
import { localHttpConnector } from "../lib/backend/local-http.ts";
import type { BackendConnection } from "../lib/connection.ts";

type ConnectionState = {
  status: "disconnected" | "connecting" | "connected" | "error";
  origin?: string;
  client?: BackendClient;
  checkedAt?: number;
  error?: string;
  connect: (address: string) => Promise<boolean>;
  disconnect: () => void;
  check: () => void;
};

const Context = createContext<ConnectionState | null>(null);

export function ConnectionProvider({
  children,
  connector = localHttpConnector,
}: {
  children: ReactNode;
  connector?: BackendConnector;
}) {
  const [connection, setConnection] = useState<
    BackendConnection & { client: BackendClient }
  >();
  const [status, setStatus] =
    useState<ConnectionState["status"]>("disconnected");
  const [error, setError] = useState<string>();
  const pending = useRef<AbortController | undefined>(undefined);
  const monitor = useRef<AbortController | undefined>(undefined);

  const active = useRef<BackendClient | undefined>(undefined);
  useEffect(
    () => () => {
      pending.current?.abort();
      monitor.current?.abort();
      active.current?.close();
    },
    [],
  );

  const connect = useCallback(
    async (address: string) => {
      pending.current?.abort();
      monitor.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      active.current?.close();
      active.current = undefined;
      setConnection(undefined);
      setError(undefined);
      setStatus("connecting");
      try {
        const client = await connector.open(address, controller.signal);
        if (controller.signal.aborted) {
          client.close();
          return false;
        }
        active.current = client;
        setConnection({ client, origin: client.origin, checkedAt: Date.now() });
        setStatus("connected");
        return true;
      } catch (cause) {
        if (controller.signal.aborted) return false;
        setError(cause instanceof Error ? cause.message : "Connection failed.");
        setStatus("error");
        return false;
      }
    },
    [connector],
  );

  function disconnect() {
    pending.current?.abort();
    monitor.current?.abort();
    setConnection(undefined);
    setError(undefined);
    active.current?.close();
    active.current = undefined;
    setStatus("disconnected");
  }

  useEffect(() => {
    if (!connection) return;
    const controller = new AbortController();
    monitor.current = controller;
    const timer = setTimeout(async () => {
      try {
        const result = await connection.client.probe(controller.signal);
        if (!controller.signal.aborted)
          setConnection({ ...result, client: connection.client });
      } catch (cause) {
        if (controller.signal.aborted) return;
        connection.client.close();
        active.current = undefined;
        setConnection(undefined);
        setError(cause instanceof Error ? cause.message : "Connection lost.");
        setStatus("error");
      }
    }, 5000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [connection]);

  return (
    <Context
      value={{
        status,
        origin: connection?.origin,
        client: connection?.client,
        checkedAt: connection?.checkedAt,
        error,
        connect,
        disconnect,
        check: () => {
          if (connection) void connect(connection.origin);
        },
      }}
    >
      {children}
    </Context>
  );
}

export function useConnection() {
  const state = useContext(Context);
  if (!state) throw new Error("ConnectionProvider is required");
  return state;
}
