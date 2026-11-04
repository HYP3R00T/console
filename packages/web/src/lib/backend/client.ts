import type { BackendConnection } from "../connection.ts";

/** A connected backend, including the lifetime of its requests and subscriptions. */
export interface BackendClient {
  readonly origin: string;
  probe(signal: AbortSignal): Promise<BackendConnection>;
  request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  subscribe(
    path: string,
    event: string,
    observer: {
      message: (data: string) => void;
      reconnecting: () => void;
    },
  ): () => void;
  close(): void;
}

/** Establishes a reachable endpoint and returns an authenticated API client. */
export interface BackendConnector {
  open(address: string, signal: AbortSignal): Promise<BackendClient>;
}

export class BackendRequestError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
