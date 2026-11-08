import {
  type InspectorSelection,
  parseInspectorSelection,
} from "./inspector-preferences.ts";
export type NavigationMemory = {
  routes: Record<string, string>;
  disclosures: Record<string, boolean>;
  recentRoutes?: string[];
  inspectors?: Record<string, InspectorSelection>;
};
export const navigationMemoryKey = "console.navigation.v1";
export const emptyNavigationMemory = (): NavigationMemory => ({
  routes: {},
  disclosures: {},
});

/** Only workspace routes can be restored; never arbitrary URLs or settings pages. */
export function workspaceDevice(path: string): string | undefined {
  const match =
    /^\/devices\/([^/?#]+)\/(?:conversations\/[^/?#]+(?:\/[1-9][0-9]*)?|projects\/[^/?#]+\/conversations\/new|projects\/[^/?#]+\/sessions\/[^/?#]+\/conversations\/[^/?#]+)$/.exec(
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
    if ("recentRoutes" in data && Array.isArray(data.recentRoutes))
      result.recentRoutes = [
        ...new Set(
          data.recentRoutes.filter(
            (route): route is string =>
              typeof route === "string" && !!workspaceDevice(route),
          ),
        ),
      ].slice(0, 30);
    if (
      "inspectors" in data &&
      data.inspectors &&
      typeof data.inspectors === "object" &&
      !Array.isArray(data.inspectors)
    ) {
      result.inspectors = {};
      for (const [key, value] of Object.entries(data.inspectors)) {
        const selection = parseInspectorSelection(value);
        if (selection && key.length <= 1024)
          Object.defineProperty(result.inspectors, key, {
            value: selection,
            enumerable: true,
            writable: true,
            configurable: true,
          });
      }
    }
  } catch {
    /* Corrupt browser preferences do not block navigation. */
  }
  return result;
}

export function rememberWorkspaceRoute(
  current: NavigationMemory,
  pathname: string,
): NavigationMemory {
  const id = workspaceDevice(pathname);
  if (!id) return current;
  if (current.routes[id] === pathname && current.recentRoutes?.[0] === pathname)
    return current;
  return {
    ...current,
    routes: { ...current.routes, [id]: pathname },
    recentRoutes: [
      pathname,
      ...(current.recentRoutes ?? Object.values(current.routes)).filter(
        (route) => route !== pathname,
      ),
    ].slice(0, 30),
  };
}
