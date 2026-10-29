// Schedule after completion, never overlap requests, and ignore work after cleanup.
export function startPolling<T>({
  read,
  onValue,
  onError,
  interval,
}: {
  read: (signal: AbortSignal) => Promise<T>;
  onValue: (value: T) => void;
  onError: (error: Error) => void;
  interval: number;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  async function poll() {
    try {
      const value = await read(controller.signal);
      if (!controller.signal.aborted) onValue(value);
    } catch (cause) {
      if (!controller.signal.aborted) onError(cause as Error);
    }
    if (!controller.signal.aborted) timer = setTimeout(poll, interval);
  }
  void poll();
  return () => {
    controller.abort();
    clearTimeout(timer);
  };
}
