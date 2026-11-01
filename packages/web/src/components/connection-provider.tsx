"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type BackendConnection, checkConnection } from "../lib/connection.ts";

type ConnectionState = {
  status: "disconnected" | "connecting" | "connected" | "error";
  origin?: string;
  checkedAt?: number;
  error?: string;
  connect: (address: string) => Promise<boolean>;
  disconnect: () => void;
  check: () => void;
};

const Context = createContext<ConnectionState | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<BackendConnection>();
  const [status, setStatus] =
    useState<ConnectionState["status"]>("disconnected");
  const [error, setError] = useState<string>();
  const pending = useRef<AbortController | undefined>(undefined);
  const monitor = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => pending.current?.abort(), []);

  async function connect(address: string) {
    pending.current?.abort();
    monitor.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setConnection(undefined);
    setError(undefined);
    setStatus("connecting");
    try {
      const result = await checkConnection(address, controller.signal);
      if (controller.signal.aborted) return false;
      setConnection(result);
      setStatus("connected");
      return true;
    } catch (cause) {
      if (controller.signal.aborted) return false;
      setError(cause instanceof Error ? cause.message : "Connection failed.");
      setStatus("error");
      return false;
    }
  }

  function disconnect() {
    pending.current?.abort();
    monitor.current?.abort();
    setConnection(undefined);
    setError(undefined);
    setStatus("disconnected");
  }

  useEffect(() => {
    if (!connection) return;
    const controller = new AbortController();
    monitor.current = controller;
    const timer = setTimeout(async () => {
      try {
        const result = await checkConnection(
          connection.origin,
          controller.signal,
        );
        if (!controller.signal.aborted) setConnection(result);
      } catch (cause) {
        if (controller.signal.aborted) return;
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
