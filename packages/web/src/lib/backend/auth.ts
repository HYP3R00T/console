import { backendOrigin } from "../connection.ts";

const credentials = new Map<string, string>();
const storageKey = (origin: string) => `console.access:${origin}`;
export function backendToken(origin: string) {
  if (credentials.has(origin)) return credentials.get(origin);
  if (typeof sessionStorage === "undefined") return undefined;
  const token = sessionStorage.getItem(storageKey(origin)) ?? undefined;
  if (token) credentials.set(origin, token);
  return token;
}
export function setBackendToken(origin: string, token: string) {
  if (typeof sessionStorage !== "undefined")
    sessionStorage.setItem(storageKey(origin), token);
  credentials.set(origin, token);
}
export function clearBackendToken(origin: string) {
  credentials.delete(origin);
  if (typeof sessionStorage !== "undefined")
    sessionStorage.removeItem(storageKey(origin));
}
export async function pairBackend(address: string, code: string, name: string) {
  const origin = backendOrigin(address);
  const response = await fetch(`${origin}/v1/access/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.trim(), name: name.trim() }),
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok || typeof data.token !== "string")
    throw new Error(
      typeof data.error === "string" ? data.error : "Pairing failed.",
    );
  setBackendToken(origin, data.token);
}
