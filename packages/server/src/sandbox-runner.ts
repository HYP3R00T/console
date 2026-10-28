import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nonoExecutable, type SandboxPolicy } from "./sandbox-policy.ts";

export type SandboxRequest = {
  operation: "check" | "read" | "write" | "fetch" | "probe-network";
  path?: string;
  content?: string;
  url?: string;
  port?: number;
  protocol?: "tcp" | "udp";
};
const worker = fileURLToPath(
  new URL(
    import.meta.url.endsWith(".ts")
      ? "./sandbox-worker.ts"
      : "./sandbox-worker.js",
    import.meta.url,
  ),
);
const cleanEnvironment = (home: string) => ({
  PATH: process.env.PATH,
  HOME: home,
  XDG_CONFIG_HOME: home,
  XDG_STATE_HOME: home,
  NONO_NO_UPDATE_CHECK: "1",
  LANG: "C.UTF-8",
});

export async function sandboxSupport() {
  let binary: string;
  try {
    binary = await nonoExecutable();
  } catch {
    return { available: false, version: "nono unavailable; run mise install" };
  }
  return new Promise<{ available: boolean; version: string }>((accept) => {
    execFile(
      binary,
      ["--version"],
      { env: cleanEnvironment(tmpdir()), timeout: 3000 },
      (error, stdout) => {
        const version = stdout.trim();
        accept({
          available: !error && version === "nono 0.80.0",
          version: error ? "nono unavailable; run mise install" : version,
        });
      },
    );
  });
}

export async function runSandbox(
  policy: SandboxPolicy,
  request: SandboxRequest,
  privateDirectory: string,
  signal?: AbortSignal,
) {
  if (!policy.enabled || !policy.workspace)
    throw new Error("Sandbox tools are disabled");
  if (!(await sandboxSupport()).available)
    throw new Error("nono 0.80.0 is required; no unconfined fallback");
  const binary = await nonoExecutable();
  const scratch = await mkdtemp(join(privateDirectory, ".tool-"));
  try {
    const grants: { path: string; access: string; type: string }[] = [];
    const grant = async (path: string, access: string, type: string) => {
      grants.push({ path: await realpath(path), access, type });
    };
    await grant(policy.workspace, "read", "directory");
    for (const path of policy.readPaths) await grant(path, "read", "directory");
    for (const path of policy.writePaths)
      await grant(path, "readwrite", "directory");
    // Fixed read-only runtime prerequisites, separate from user workspace authority.
    for (const path of [
      process.execPath,
      worker,
      join(dirname(worker), "../package.json"),
      "/etc/ld.so.cache",
      "/etc/ssl/openssl.cnf",
      "/dev/null",
      "/dev/urandom",
    ]) {
      if (existsSync(path)) await grant(path, "read", "file");
    }
    for (const path of process.platform === "darwin"
      ? ["/usr/lib", "/System/Library"]
      : ["/usr/lib", "/lib"]) {
      if (existsSync(path)) await grant(path, "read", "directory");
    }
    const manifest = join(scratch, "manifest.json");
    await writeFile(
      manifest,
      JSON.stringify({
        version: "0.1.0",
        filesystem: { grants },
        network: { mode: policy.network, dns: policy.network !== "blocked" },
        process: {
          exec_strategy: "direct",
          signal_mode: "isolated",
          process_info_mode: "isolated",
        },
      }),
      { mode: 0o600 },
    );
    return await new Promise<string>((accept, reject) => {
      const child = execFile(
        binary,
        [
          "wrap",
          "--silent",
          "--no-diagnostics",
          "--config",
          manifest,
          "--",
          process.execPath,
          worker,
        ],
        {
          cwd: policy.workspace,
          env: cleanEnvironment(scratch),
          timeout: 10_000,
          maxBuffer: 512 * 1024,
          signal,
        },
        (error, stdout) => {
          let result: { output?: string; error?: string };
          try {
            result = JSON.parse(stdout);
          } catch {
            reject(
              new Error(
                "Sandbox failed to start or finish; no unconfined fallback",
              ),
            );
            return;
          }
          if (error || result.error)
            reject(
              new Error(
                `Sandbox operation denied or failed: ${result.error ?? "worker_failed"}`,
              ),
            );
          else accept(result.output ?? "");
        },
      );
      child.stdin?.on("error", () => {});
      child.stdin?.end(JSON.stringify(request));
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
