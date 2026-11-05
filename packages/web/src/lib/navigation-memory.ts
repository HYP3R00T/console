export type NavigationMemory = {
  routes: Record<string, string>;
  disclosures: Record<string, boolean>;
};
export const navigationMemoryKey = "console.navigation.v1";
export const emptyNavigationMemory = (): NavigationMemory => ({
  routes: {},
  disclosures: {},
});

/** Only workspace routes can be restored; never arbitrary URLs or settings pages. */
export function workspaceDevice(path: string): string | undefined {
  const match =
    /^\/devices\/([^/?#]+)\/(?:conversations\/[^/?#]+|projects\/[^/?#]+\/sessions\/[^/?#]+\/conversations\/[^/?#]+)$/.exec(
      path,
    );
  if (!match) return;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return;
  }
}
export function parseNavigationMemory(value: string | null): NavigationMemory {
  const result = emptyNavigationMemory();
  if (!value) return result;
  try {
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== "object") return result;
    if ("routes" in data && data.routes && typeof data.routes === "object")
      for (const [id, route] of Object.entries(data.routes))
        if (typeof route === "string" && workspaceDevice(route) === id)
          Object.defineProperty(result.routes, id, {
            value: route,
            enumerable: true,
            writable: true,
            configurable: true,
          });
    if (
      "disclosures" in data &&
      data.disclosures &&
      typeof data.disclosures === "object"
    )
      for (const [key, open] of Object.entries(data.disclosures))
        if (typeof open === "boolean")
          Object.defineProperty(result.disclosures, key, {
            value: open,
            enumerable: true,
            writable: true,
            configurable: true,
          });
  } catch {
    /* Corrupt browser preferences do not block navigation. */
  }
  return result;
}
