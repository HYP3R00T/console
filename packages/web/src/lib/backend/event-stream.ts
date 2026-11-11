/** Fetch-based SSE permits an Authorization header without putting credentials in URLs. */
export function authenticatedEvents(
  url: string,
  token: string,
  event: string,
  observer: { message: (data: string) => void; reconnecting: () => void },
  lifetime: AbortSignal,
) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, lifetime]);
  let retry: ReturnType<typeof setTimeout> | undefined;
  const connect = async () => {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal,
      });
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get("content-type")?.includes("text/event-stream")
      )
        throw new Error("Event stream unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (!signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let boundary = /\r?\n\r?\n/.exec(buffer);
          while (boundary) {
            const frame = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            let kind = "message";
            const data: string[] = [];
            for (const line of frame.split(/\r?\n/)) {
              if (line.startsWith("event:")) kind = line.slice(6).trimStart();
              if (line.startsWith("data:"))
                data.push(line.slice(5).replace(/^ /, ""));
            }
            if (kind === event && data.length && !signal.aborted)
              observer.message(data.join("\n"));
            boundary = /\r?\n\r?\n/.exec(buffer);
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch {
      /* The connection manager probes authorization and reports failures. */
    }
    if (!signal.aborted) {
      observer.reconnecting();
      retry = setTimeout(() => void connect(), 1000);
    }
  };
  void connect();
  const close = () => {
    clearTimeout(retry);
    controller.abort();
  };
  signal.addEventListener("abort", () => clearTimeout(retry), { once: true });
  return close;
}
