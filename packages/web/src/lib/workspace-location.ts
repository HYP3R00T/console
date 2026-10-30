const key = "console.workspace-location";
export function rememberWorkspaceLocation(
  path = window.location.pathname + window.location.search,
) {
  if (!/^\/(?:chat)?(?:\?|$)/.test(path)) return;
  try {
    sessionStorage.setItem(key, path);
  } catch {
    /* Navigation remains usable without storage. */
  }
}
export function workspaceLocation() {
  try {
    const saved = sessionStorage.getItem(key);
    return saved && /^\/(?:chat)?(?:\?|$)/.test(saved) ? saved : "/chat";
  } catch {
    return "/chat";
  }
}
