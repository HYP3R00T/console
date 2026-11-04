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
import { useBackendRequest } from "@/hooks/use-backend-request";
import type { ProviderOverview } from "@/lib/providers";

type State = {
  origin?: string;
  overview?: ProviderOverview;
  error?: string;
  refresh: () => Promise<void>;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};
const Context = createContext<State | null>(null);
export function ProvidersProvider({ children }: { children: ReactNode }) {
  const { origin, client, request } = useBackendRequest();
  const refreshVersion = useRef(0);
  const latest = useRef(client);
  latest.current = client;
  const scope = useRef<AbortController | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<{
    origin: string;
    client: typeof client;
    overview?: ProviderOverview;
    error?: string;
  }>();
  const refresh = useCallback(async () => {
    if (!origin) return;
    const version = ++refreshVersion.current;
    try {
      const overview = await request<ProviderOverview>("/v1/providers");
      if (
        !Array.isArray(overview.providers) ||
        !Number.isInteger(overview.activeCount)
      )
        throw new Error("Invalid provider response.");
      if (latest.current === client && version === refreshVersion.current)
        setSnapshot({ origin, client, overview });
    } catch (error) {
      if (
        latest.current === client &&
        version === refreshVersion.current &&
        !scope.current?.signal.aborted
      )
        setSnapshot((previous) => ({
          origin,
          client,
          overview: previous?.origin === origin ? previous.overview : undefined,
          error:
            error instanceof Error
              ? error.message
              : "Could not load providers.",
        }));
    }
  }, [origin, client, request]);
  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [refresh]);
  const current =
    snapshot?.origin === origin && snapshot?.client === client
      ? snapshot
      : undefined;
  return (
    <Context
      value={{
        origin,
        overview: current?.overview,
        error: current?.error,
        refresh,
        request,
      }}
    >
      {children}
    </Context>
  );
}
export function useProviders() {
  const state = useContext(Context);
  if (!state) throw new Error("ProvidersProvider is required");
  return state;
}
