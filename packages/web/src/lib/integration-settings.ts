export type IntegrationKind = "mcp" | "ssh";
export type IntegrationEntry = Record<string, string | number | string[]>;
export type IntegrationConfiguration = Record<
  string,
  Record<string, IntegrationEntry>
>;
export const integrationRoot = (kind: IntegrationKind) =>
  kind === "mcp" ? "servers" : "profiles";
export function parseIntegrationDraft(
  text: string,
  kind: IntegrationKind,
): IntegrationConfiguration | undefined {
  try {
    const value = JSON.parse(text);
    const root = integrationRoot(kind);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      !value[root] ||
      typeof value[root] !== "object" ||
      Array.isArray(value[root])
    )
      return;
    if (
      Object.values(value[root]).some(
        (entry) => !entry || typeof entry !== "object" || Array.isArray(entry),
      )
    )
      return;
    return value;
  } catch {
    return;
  }
}
export function upsertIntegration(
  configuration: IntegrationConfiguration,
  kind: IntegrationKind,
  name: string,
  entry: IntegrationEntry,
  original?: string,
) {
  if (!/^[a-z][a-z0-9-]{0,23}$/.test(name))
    throw new Error(
      "Use 1–24 lowercase letters, digits or hyphens, starting with a letter.",
    );
  const root = integrationRoot(kind),
    entries = configuration[root];
  if (name !== original && Object.hasOwn(entries, name))
    throw new Error("That name is already in use.");
  if (!original && Object.keys(entries).length >= (kind === "mcp" ? 8 : 16))
    throw new Error(
      kind === "mcp"
        ? "At most eight servers are supported."
        : "At most sixteen workspaces are supported.",
    );
  if (
    kind === "mcp" &&
    (typeof entry.command !== "string" || !entry.command.startsWith("/"))
  )
    throw new Error("Command must be an absolute path on the backend machine.");
  if (kind === "ssh")
    for (const key of ["host", "hostKeyAlias", "knownHostsFile", "cwd"])
      if (typeof entry[key] !== "string" || !entry[key])
        throw new Error(`Enter ${key}.`);
  return {
    [root]: Object.fromEntries([
      ...Object.entries(entries).filter(([key]) => key !== original),
      [name, entry],
    ]),
  };
}
