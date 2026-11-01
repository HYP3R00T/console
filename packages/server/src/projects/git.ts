import { spawn } from "node:child_process";
import { ProjectError } from "./errors.ts";

export function publicRepository(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProjectError(400, "Enter a public HTTPS Git URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.hostname ||
    url.pathname === "/"
  ) {
    throw new ProjectError(
      400,
      "Use a public HTTPS repository URL without credentials, query parameters or fragments.",
    );
  }
  return url.href;
}
export function gitEnvironment() {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    GIT_LFS_SKIP_SMUDGE: "1",
    LANG: "C",
    LC_ALL: "C",
  };
}

export async function runGit(args: string[], cwd: string, signal: AbortSignal) {
  signal.throwIfAborted();
  // Deliberately omit inherited Git, credential, proxy and personal configuration variables.
  const env = gitEnvironment();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "git",
      [
        "-c",
        "credential.helper=",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "protocol.allow=never",
        "-c",
        "protocol.https.allow=always",
        "-c",
        "http.followRedirects=false",
        ...args,
      ],
      { cwd, env, stdio: "ignore", detached: process.platform !== "win32" },
    );
    const stop = () => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch {
        /* The process may have already exited. */
      }
    };
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    child.once("close", () => signal.removeEventListener("abort", stop));
    child.once("error", (error) =>
      reject(
        new ProjectError(
          (error as NodeJS.ErrnoException).code === "ENOENT" ? 503 : 502,
          signal.aborted
            ? "Git operation cancelled or timed out."
            : "Git could not start. Ensure Git is installed on this machine.",
        ),
      ),
    );
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new ProjectError(
              502,
              signal.aborted
                ? "Git operation cancelled or timed out."
                : "Git operation failed. Check the repository URL and public access.",
            ),
          ),
    );
  });
}
