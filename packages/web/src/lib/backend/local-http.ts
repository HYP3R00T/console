import { backendOrigin, checkConnection } from "../connection.ts";
import {
  type BackendClient,
  type BackendConnector,
  BackendRequestError,
} from "./client.ts";

/** Current local-only policy. Future connectors can own tunnels and authentication. */
export const localHttpConnector: BackendConnector = {
  async open(address, signal) {
    const origin = backendOrigin(address);
    const client = createLocalClient(origin);
    const cancel = () => client.close();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      signal.throwIfAborted();
      await client.probe(signal);
      signal.throwIfAborted();
      return client;
    } catch (error) {
      client.close();
      throw error;
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  },
};

function createLocalClient(origin: string): BackendClient {
  const lifetime = new AbortController();
  let backendId: string | undefined;
  function url(path: string) {
    // Keep future credentials scoped to this backend, including malformed paths.
    const target = new URL(path, origin);
    if (
      !path.startsWith("/") ||
      target.origin !== origin ||
      path.includes("\\")
    )
      throw new Error("Use a path on the connected backend.");
    return target.href;
  }
  return {
    origin,
    get backendId() {
      return backendId;
    },
    probe: async (signal) => {
      const result = await checkConnection(
        origin,
        AbortSignal.any([signal, lifetime.signal]),
      );
      backendId = result.backendId;
      return result;
    },
    async request<T>(
      path: string,
      init: RequestInit = {},
      timeoutMs = 20000,
    ): Promise<T> {
      lifetime.signal.throwIfAborted();
      const signal = AbortSignal.any([
        lifetime.signal,
        AbortSignal.timeout(timeoutMs),
        ...(init.signal ? [init.signal] : []),
      ]);
      const headers = new Headers(init.headers);
      if (init.body && !headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
      const response = await fetch(url(path), {
        ...init,
        headers,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal,
      });
      const data = await response.json();
      signal.throwIfAborted();
      if (!response.ok)
        throw new BackendRequestError(
          typeof data?.error === "string"
            ? data.error
            : `Backend returned HTTP ${response.status}.`,
          typeof data?.code === "string" ? data.code : undefined,
          response.status,
        );
      return data as T;
    },
    subscribe(path, event, observer) {
      lifetime.signal.throwIfAborted();
      const events = new EventSource(url(path));
      let closed = false;
      const close = () => {
        closed = true;
        events.close();
        lifetime.signal.removeEventListener("abort", close);
      };
      events.addEventListener(event, (message) => {
        if (!closed && !lifetime.signal.aborted)
          observer.message((message as MessageEvent<string>).data);
      });
      events.onerror = () => {
        if (!closed && !lifetime.signal.aborted) observer.reconnecting();
      };
      lifetime.signal.addEventListener("abort", close, { once: true });
      return close;
    },
    close: () => lifetime.abort(new Error("The backend connection ended.")),
  };
}
