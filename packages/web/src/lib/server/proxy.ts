const limit = 8 * 1024 * 1024;
async function bounded(response: Response | Request, max: number) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new Error("Body exceeds limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function proxy(request: Request, path: string[], fetcher = fetch) {
  const incoming = new URL(request.url);
  const loopback = (host: string) =>
    ["127.0.0.1", "localhost", "[::1]"].includes(host);
  if (!loopback(incoming.hostname))
    return Response.json(
      { message: "The MVP web client is local-only." },
      { status: 403 },
    );
  if (
    !["GET", "HEAD"].includes(request.method) &&
    (request.headers.get("x-console-request") !== "1" ||
      (request.headers.has("origin") &&
        request.headers.get("origin") !== incoming.origin))
  )
    return Response.json(
      { message: "Same-origin mutation required." },
      { status: 403 },
    );
  try {
    const backend = new URL("http://127.0.0.1:3000");
    if (
      !path.length ||
      !["info", "provider", "projects", "sessions"].includes(path[0]) ||
      path.some((part) => !/^[a-zA-Z0-9-]+$/.test(part))
    )
      return Response.json({ message: "Endpoint not found." }, { status: 404 });
    const target = new URL(
      `/v1/${path.map(encodeURIComponent).join("/")}${incoming.search}`,
      backend,
    );
    const headers: Record<string, string> = { "x-console-request": "1" };
    if (request.headers.get("content-type"))
      headers["content-type"] = request.headers.get("content-type") ?? "";
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : Buffer.from(await bounded(request, 256 * 1024));
    const response = await fetcher(target, {
      method: request.method,
      headers,
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
    });
    const bytes = await bounded(response, limit);
    return new Response(
      response.status === 204 || request.method === "HEAD" ? null : bytes,
      {
        status: response.status,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      {
        message:
          "Local backend unavailable. Check its process and configuration.",
      },
      { status: 502 },
    );
  }
}
