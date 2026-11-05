import type { BackendClient } from "../../lib/backend/client.ts";
import { ChatTranscript, type TranscriptSection } from "./chat-transcript.ts";
import type { ChatSnapshot, TranscriptChunk } from "./conversation-state.ts";

export type ConversationFeedState = {
  data?: ChatSnapshot;
  sections: TranscriptSection[];
  status: string;
};

/** One mounted conversation/client lifetime. A reconnect retains its transcript; a new feed never inherits it. */
export class ConversationFeed {
  private transcript = new ChatTranscript();
  private state: ConversationFeedState = {
    sections: [],
    status: "Connecting…",
  };
  private controller = new AbortController();
  private pending = new Map<number, Promise<void>>();
  private unsubscribe?: () => void;
  private closed = false;
  private client: BackendClient;
  private path: string;
  private changed: (state: ConversationFeedState) => void;

  constructor(
    client: BackendClient,
    path: string,
    changed: (state: ConversationFeedState) => void,
  ) {
    this.client = client;
    this.path = path;
    this.changed = changed;
  }

  private publish(state: ConversationFeedState) {
    if (this.closed) return;
    this.state = state;
    this.changed(state);
  }

  start() {
    this.publish(this.state);
    this.unsubscribe = this.client.subscribe(
      `${this.path}/events`,
      "snapshot",
      {
        message: (message) => {
          if (this.closed) return;
          try {
            const data: ChatSnapshot = JSON.parse(message);
            if (
              !Array.isArray(data.messages) ||
              typeof data.busy !== "boolean" ||
              data.id !== Number(this.path.split("/").at(-1))
            )
              throw new Error("Invalid snapshot.");
            // Partial text must not refresh the inspector's identical execution state.
            if (
              JSON.stringify(data.execution) ===
              JSON.stringify(this.state.data?.execution)
            )
              data.execution = this.state.data?.execution;
            this.publish({
              data,
              sections: this.transcript.merge(data),
              status: "Live",
            });
          } catch {
            this.publish({
              ...this.state,
              status: "Invalid conversation update.",
            });
            this.close();
          }
        },
        reconnecting: () =>
          this.publish({ ...this.state, status: "Reconnecting…" }),
      },
    );
    if (this.closed) this.unsubscribe();
  }

  loadHistory(before: number): Promise<void> {
    if (this.closed)
      return Promise.reject(new Error("Conversation is no longer connected."));
    const existing = this.pending.get(before);
    if (existing) return existing;
    const request = this.client
      .request<TranscriptChunk>(`${this.path}/history?before=${before}`, {
        signal: this.controller.signal,
      })
      .then((chunk) => {
        if (this.closed) return;
        if (
          !chunk.history?.ids.length ||
          chunk.history.ids.some((id) => id >= before)
        )
          throw new Error("Could not fill this history gap.");
        this.publish({ ...this.state, sections: this.transcript.merge(chunk) });
      })
      .finally(() => this.pending.delete(before));
    this.pending.set(before, request);
    return request;
  }

  close() {
    this.closed = true;
    this.controller.abort();
    this.unsubscribe?.();
  }
}
