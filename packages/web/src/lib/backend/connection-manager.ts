import type { BackendClient, BackendConnector } from "./client.ts";

export type ConnectionState = {
  status: "disconnected" | "connecting" | "connected" | "error";
  origin?: string;
  client?: BackendClient;
  backendId?: string;
  checkedAt?: number;
  error?: string;
};
export const disconnected: ConnectionState = { status: "disconnected" };
type Attempt = {
  controller: AbortController;
  client?: BackendClient;
  timer?: ReturnType<typeof setTimeout>;
};

/** Each bookmark owns its lifetime. Navigation never closes another machine's client. */
export class ConnectionManager {
  private connector: BackendConnector;
  private interval: number;
  private attempts = new Map<string, Attempt>();
  private listeners = new Set<() => void>();
  private states: Readonly<Record<string, ConnectionState>> = {};
  constructor(connector: BackendConnector, interval = 5000) {
    this.connector = connector;
    this.interval = interval;
  }
  snapshot = () => this.states;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(id: string, state: ConnectionState) {
    this.states = { ...this.states, [id]: state };
    for (const listener of this.listeners) listener();
  }
  private release(id: string) {
    const previous = this.attempts.get(id);
    this.attempts.delete(id);
    previous?.controller.abort();
    clearTimeout(previous?.timer);
    previous?.client?.close();
  }
  disconnect(id: string) {
    this.release(id);
    this.update(id, disconnected);
  }
  close() {
    for (const id of this.attempts.keys()) this.disconnect(id);
  }
  async connect(id: string, address: string, expectedId?: string) {
    this.release(id);
    const attempt: Attempt = { controller: new AbortController() };
    this.attempts.set(id, attempt);
    this.update(id, { status: "connecting", origin: address });
    try {
      const client = await this.connector.open(
        address,
        attempt.controller.signal,
      );
      if (this.attempts.get(id) !== attempt) {
        client.close();
        return false;
      }
      attempt.client = client;
      const backendId = client.backendId;
      if (!backendId)
        throw new Error(
          "Backend did not provide an installation identity. Update the backend.",
        );
      if (expectedId && expectedId !== backendId)
        throw new Error(
          "Backend identity changed. Edit this connection to accept its new address and identity.",
        );
      if (
        Object.entries(this.states).some(
          ([other, state]) =>
            other !== id &&
            state.status === "connected" &&
            state.backendId === backendId,
        )
      )
        throw new Error(
          "This backend is already connected through another saved device.",
        );
      this.update(id, {
        status: "connected",
        origin: client.origin,
        client,
        backendId,
        checkedAt: Date.now(),
      });
      this.schedule(id, attempt, backendId);
      return true;
    } catch (error) {
      if (this.attempts.get(id) !== attempt) return false;
      this.release(id);
      this.update(id, {
        status: "error",
        origin: address,
        error: error instanceof Error ? error.message : "Connection failed.",
      });
      return false;
    }
  }
  private schedule(id: string, attempt: Attempt, identity: string) {
    attempt.timer = setTimeout(async () => {
      try {
        const result = await attempt.client?.probe(attempt.controller.signal);
        if (this.attempts.get(id) !== attempt || !result) return;
        if (result.backendId !== identity)
          throw new Error(
            "Backend identity changed. Reconnect after reviewing this connection.",
          );
        this.update(id, {
          status: "connected",
          ...result,
          client: attempt.client,
        });
        this.schedule(id, attempt, identity);
      } catch (error) {
        if (this.attempts.get(id) !== attempt) return;
        this.release(id);
        this.update(id, {
          status: "error",
          origin: this.states[id]?.origin,
          error: error instanceof Error ? error.message : "Connection lost.",
        });
      }
    }, this.interval);
  }
}
