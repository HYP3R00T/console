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
import { useConnection } from "@/components/connection-provider";
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
  const { origin } = useConnection();
  const refreshVersion = useRef(0);
  const latest = useRef(origin);
  latest.current = origin;
  const scope = useRef<AbortController | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<{
    origin: string;
    overview?: ProviderOverview;
    error?: string;
  }>();
  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      if (!origin) throw new Error("Connect this backend first.");
      const signal = AbortSignal.any([
        AbortSignal.timeout(20000),
        ...(scope.current ? [scope.current.signal] : []),
        ...(init.signal ? [init.signal] : []),
      ]);
      const response = await fetch(`${origin}${path}`, {
        ...init,
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal,
      });
      const data = await response.json();
      if (latest.current !== origin)
        throw new Error("The backend connection changed.");
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : `Backend returned HTTP ${response.status}.`,
        );
      return data as T;
    },
    [origin],
  );
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
      if (latest.current === origin && version === refreshVersion.current)
        setSnapshot({ origin, overview });
    } catch (error) {
      if (
        latest.current === origin &&
        version === refreshVersion.current &&
        !scope.current?.signal.aborted
      )
        setSnapshot((previous) => ({
          origin,
          overview: previous?.origin === origin ? previous.overview : undefined,
          error:
            error instanceof Error
              ? error.message
              : "Could not load providers.",
        }));
    }
  }, [origin, request]);
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
  const current = snapshot?.origin === origin ? snapshot : undefined;
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
