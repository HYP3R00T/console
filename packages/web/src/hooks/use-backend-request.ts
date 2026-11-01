"use client";
import { useCallback, useEffect, useRef } from "react";
import { useConnection } from "@/components/connection-provider";

export function useBackendRequest() {
  const { origin } = useConnection();
  const latest = useRef(origin);
  latest.current = origin;
  const scope = useRef<
    { origin: string; controller: AbortController } | undefined
  >(undefined);
  useEffect(
    () => () => {
      const current = scope.current;
      if (current && current.origin === origin) current.controller.abort();
    },
    [origin],
  );
  const request = useCallback(
    async <T>(
      path: string,
      init: RequestInit = {},
      timeoutMs = 20000,
    ): Promise<T> => {
      if (!origin || latest.current !== origin)
        throw new Error("Connect this backend first.");
      if (
        scope.current?.origin !== origin ||
        scope.current.controller.signal.aborted
      ) {
        scope.current = { origin, controller: new AbortController() };
      }
      const signal = AbortSignal.any([
        AbortSignal.timeout(timeoutMs),
        scope.current.controller.signal,
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
      signal.throwIfAborted();
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
  return { origin, request };
}
