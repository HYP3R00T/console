import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineDoc } from "@earendil-works/pi-durable";
import { httpError } from "../http/errors.ts";

export type SandboxPolicy = {
  enabled: boolean;
  commands?: boolean;
  workspace: string;
  readPaths: string[];
  writePaths: string[];
  network: "blocked" | "unrestricted";
};
export const defaultSandbox = (): SandboxPolicy => ({
  enabled: false,
  commands: false,
  workspace: "",
  readPaths: [],
  writePaths: [],
  network: "blocked",
});
export const SandboxDoc = defineDoc<SandboxPolicy>({
  kind: "console.sandbox",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: defaultSandbox,
  checkpointWhen: () => true,
});
export const consoleRoot = fileURLToPath(
  new URL("../../../..", import.meta.url),
);

export async function nonoExecutable() {
  const name = process.env.CONSOLE_NONO_BIN ?? "nono";
  const paths = isAbsolute(name)
    ? [name]
    : (process.env.PATH ?? "")
        .split(delimiter)
        .filter(Boolean)
        .map((path) => join(path, name));
  for (const path of paths) {
    try {
      await access(path, constants.X_OK);
      return await realpath(path);
    } catch {
      /* Try next PATH entry. */
    }
  }
  throw new Error("nono unavailable; run mise install");
}

function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
  );
}

export async function validateSandbox(
  policy: SandboxPolicy,
  privateDirectory: string,
): Promise<SandboxPolicy> {
  if (!policy.enabled)
    return {
      ...policy,
      readPaths: [...policy.readPaths],
      writePaths: [...policy.writePaths],
    };
  const privatePath = await realpath(privateDirectory);
  const sourcePath = await realpath(consoleRoot);
  const runtimePaths = [sourcePath, await realpath(process.execPath)];
  try {
    runtimePaths.push(await nonoExecutable());
  } catch {
    /* Disabled policies can still be saved. */
  }
  async function canonical(path: string, writable: boolean) {
    if (!isAbsolute(path))
      throw httpError(400, "Sandbox paths must be absolute.");
    let result: string;
    try {
      result = await realpath(path);
      if (!(await stat(result)).isDirectory()) throw new Error();
    } catch {
      throw httpError(400, "Sandbox paths must be existing directories.");
    }
    // Additive path grants cannot carve credentials out of an allowed ancestor.
    const secrets = [
      privatePath,
      resolve(sourcePath, ".env"),
      join(
        process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"),
        "console-web",
      ),
    ];
    if (
      secrets.some(
        (secret) => contains(result, secret) || contains(secret, result),
      )
    )
      throw httpError(
        400,
        "Choose a narrower path that does not expose Console's private storage or environment.",
      );
    if (
      writable &&
      runtimePaths.some(
        (runtime) => contains(result, runtime) || contains(runtime, result),
      )
    )
      throw httpError(
        400,
        "Console source and runtime executables must remain outside writable grants.",
      );
    return result;
  }
  if (policy.enabled && !policy.workspace)
    throw httpError(400, "Select a workspace before enabling sandbox tools.");
  return {
    ...policy,
    workspace: policy.workspace ? await canonical(policy.workspace, false) : "",
    readPaths: [
      ...new Set(
        await Promise.all(
          policy.readPaths.map((path) => canonical(path, false)),
        ),
      ),
    ],
    writePaths: [
      ...new Set(
        await Promise.all(
          policy.writePaths.map((path) => canonical(path, true)),
        ),
      ),
    ],
  };
}
