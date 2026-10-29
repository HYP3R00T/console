import { homedir, hostname } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export function resolveConfiguration(
  options: { dataDirectory?: string; machineName?: string } = {},
) {
  const configured = options.dataDirectory ?? process.env.CONSOLE_DATA_DIR;
  const directory =
    configured ??
    join(
      process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"),
      "console",
    );
  if (!directory.trim() || !isAbsolute(directory))
    throw new Error("Console data directory must be an absolute path.");
  const machineName = options.machineName ?? hostname();
  if (!machineName.trim() || machineName.length > 80)
    throw new Error("Machine name must contain 1 to 80 characters.");
  return {
    directory: resolve(directory),
    machineName: machineName.trim(),
    storageSource:
      options.dataDirectory !== undefined
        ? "application"
        : configured !== undefined
          ? "CONSOLE_DATA_DIR"
          : process.env.XDG_DATA_HOME
            ? "XDG_DATA_HOME"
            : "default",
  };
}
