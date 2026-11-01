import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

export function resolveConfiguration(options: { dataDirectory?: string } = {}) {
  const directory =
    options.dataDirectory ?? join(homedir(), ".local", "share", "console");
  if (!directory.trim() || !isAbsolute(directory))
    throw new Error("Console data directory must be an absolute path.");
  return { directory: resolve(directory) };
}

export function startupArguments(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      port: { type: "string", default: "3000" },
      "data-dir": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });
  const rawPort = values.port ?? "3000";
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(port) || port > 65535)
    throw new Error("--port must be an integer between 0 and 65535.");
  return {
    port,
    help: values.help ?? false,
    ...resolveConfiguration({ dataDirectory: values["data-dir"] }),
  };
}
