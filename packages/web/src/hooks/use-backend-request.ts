"use client";
import { useCallback, useRef } from "react";
import { useConnection } from "@/components/connection-provider";

export { BackendRequestError } from "@/lib/backend/client";

export function useBackendRequest() {
  const { origin, client } = useConnection();
  const latest = useRef(client);
  latest.current = client;
  const request = useCallback(
    <T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> => {
      if (!client || latest.current !== client)
        return Promise.reject(new Error("Connect this backend first."));
      return client.request<T>(path, init, timeoutMs);
    },
    [client],
  );
  return { origin, client, request };
}
