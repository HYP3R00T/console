export type BackendConnection = {
  origin: string;
  checkedAt: number;
  backendId: string;
};

export function backendOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a backend URL, including http:// or https://.");
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Use only the backend's protocol, host and port.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error(
      "Use HTTPS for remote backends, or HTTP for loopback backends.",
    );
  }
  return url.origin;
}

export async function checkConnection(
  address: string,
  signal: AbortSignal,
  token?: string,
): Promise<BackendConnection> {
  const origin = backendOrigin(address);
  let response: Response;
  try {
    response = await fetch(`${origin}/v1/connection`, {
      ...(token && { headers: { Authorization: `Bearer ${token}` } }),
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new Error(
      "Could not reach the backend. Check its address and that it is running and allows this website.",
    );
  }
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "HTTP 401. Pair this device using a code from the backend owner."
        : `The backend returned HTTP ${response.status}.`,
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "This address did not return a Console connection response.",
    );
  }
  if (
    !data ||
    typeof data !== "object" ||
    !("product" in data) ||
    data.product !== "console" ||
    !("apiVersion" in data) ||
    data.apiVersion !== 1 ||
    !("backendId" in data) ||
    typeof data.backendId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(data.backendId)
  ) {
    throw new Error("This backend does not support Console API version 1.");
  }
  return { origin, checkedAt: Date.now(), backendId: data.backendId };
}
