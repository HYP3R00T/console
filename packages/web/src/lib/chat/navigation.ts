import type { Conversation } from "../api.ts";

// A bounded cache of read projections. The backend still owns durable execution state.
export function createConversationNavigation({
  read,
  show,
  loading,
  error,
}: {
  read: (id: string, cid: string, signal: AbortSignal) => Promise<Conversation>;
  show: (value?: Conversation) => void;
  loading: (value: boolean) => void;
  error: (cause: Error) => void;
}) {
  const cache = new Map<string, Conversation>();
  let request: AbortController | undefined;
  const key = (id: string, cid: string) => JSON.stringify([id, cid]);
  function remember(value: Conversation) {
    const identity = key(value.id, value.conversationId ?? "");
    cache.delete(identity);
    cache.set(identity, value);
    if (cache.size > 20) cache.delete(cache.keys().next().value as string);
  }
  function cancel() {
    request?.abort();
    loading(false);
  }
  return {
    remember,
    cancel,
    invalidate(id: string, cid?: string) {
      for (const [identity, value] of cache)
        if (value.id === id && (!cid || value.conversationId === cid))
          cache.delete(identity);
    },
    async open(id: string, cid = "") {
      cancel();
      if (!id) {
        show();
        return;
      }
      const cached = cache.get(key(id, cid));
      if (cached) {
        remember(cached);
        show(cached);
        return;
      }
      const controller = new AbortController();
      request = controller;
      loading(true);
      try {
        const value = await read(id, cid, controller.signal);
        if (controller.signal.aborted) return;
        remember(value);
        show(value);
      } catch (cause) {
        if (!controller.signal.aborted) error(cause as Error);
      } finally {
        if (!controller.signal.aborted) loading(false);
      }
    },
  };
}
