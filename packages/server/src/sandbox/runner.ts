import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nonoExecutable, type SandboxPolicy } from "./policy.ts";

export type SandboxRequest = {
  operation:
    | "check"
    | "read"
    | "write"
    | "fetch"
    | "list"
    | "mkdir"
    | "probe-network"
    | "command"
    | "pi"
    | "resources";
  resourceKind?: "skill" | "prompt";
  resourceName?: string;
  directory?: string;
  tool?: string;
  args?: Record<string, unknown>;
  command?: string;
  cwd?: string;
  path?: string;
  content?: string;
  url?: string;
  port?: number;
  protocol?: "tcp" | "udp";
};
const worker = fileURLToPath(
  new URL(
    import.meta.url.endsWith(".ts") ? "./worker.ts" : "./worker.js",
    import.meta.url,
  ),
);
const piWorker = fileURLToPath(
  new URL(
    import.meta.url.endsWith(".ts") ? "./pi-tools.ts" : "./pi-tools.js",
    import.meta.url,
  ),
);
const piEntry = fileURLToPath(
  import.meta.resolve("@earendil-works/pi-durable/tools"),
);
const durableRoot = dirname(dirname(dirname(piEntry)));
const resolver = createRequire(join(durableRoot, "package.json"));
const piRuntime = [
  durableRoot,
  ...[
    "typebox",
    "diff",
    "@earendil-works/chord",
    "@earendil-works/pi-telemetry",
  ].map((name) => {
    const location = resolver.resolve
      .paths(name)
      ?.map((path) => join(path, name))
      .find((path) => existsSync(join(path, "package.json")));
    if (!location) throw new Error(`Pi runtime package missing: ${name}`);
    return location;
  }),
];
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
  const command =
    request.operation === "command" ||
    (request.operation === "pi" && request.tool === "bash");
  if (command && !policy.commands)
    throw new Error("Shell commands are disabled by policy");
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
    if (request.operation === "pi") {
      await grant(piWorker, "read", "file");
      for (const path of piRuntime) await grant(path, "read", "directory");
    }
    if (request.operation === "resources") {
      await grant(
        fileURLToPath(
          new URL(
            import.meta.url.endsWith(".ts")
              ? "./resources.ts"
              : "./resources.js",
            import.meta.url,
          ),
        ),
        "read",
        "file",
      );
    }
    // Fixed read-only runtime prerequisites, separate from user workspace authority.
    for (const path of [
      process.execPath,
      worker,
      join(dirname(worker), "../../package.json"),
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
    const home = join(scratch, "home");
    await mkdir(home, { mode: 0o700 });
    await grant(home, "readwrite", "directory");
    if (policy.commands) {
      for (const path of [
        "/usr/bin",
        "/bin",
        "/usr/local/bin",
        "/etc/ssl/certs",
        "/usr/share/ca-certificates",
      ])
        if (existsSync(path)) await grant(path, "read", "directory");
      for (const path of [
        "/etc/resolv.conf",
        "/etc/hosts",
        "/etc/nsswitch.conf",
        "/etc/ssl/cert.pem",
      ])
        if (existsSync(path)) await grant(path, "read", "file");
      for (const program of [
        "node",
        "pnpm",
        "npm",
        "python3",
        "uv",
        "bash",
        "git",
        "make",
      ]) {
        for (const bin of (process.env.PATH ?? "").split(delimiter)) {
          const candidate = join(bin, program);
          if (!existsSync(candidate)) continue;
          const actual = await realpath(candidate);
          const parent = dirname(actual);
          const root =
            parent.endsWith("/bin") &&
            !parent.startsWith("/usr/") &&
            parent !== "/bin"
              ? dirname(parent)
              : parent;
          await grant(root, "read", "directory");
          break;
        }
      }
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
    signal?.throwIfAborted();
    return await new Promise<string>((accept, reject) => {
      const child = spawn(
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
          detached: command,
          stdio: "pipe",
        },
      );
      const chunks: Buffer[] = [];
      let size = 0;
      let finished = false;
      const stop = () => {
        try {
          if (command && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          /* Already exited. */
        }
      };
      const timer = setTimeout(
        () => {
          stop();
          finish("Sandbox operation timed out");
        },
        command ? 125_000 : 10_000,
      );
      function finish(failure?: string, code?: number | null) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (command) stop();
        if (failure) {
          reject(new Error(failure));
          return;
        }
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            output?: string;
            error?: string;
          };
          if (code !== 0 || result.error)
            reject(
              new Error(
                `Sandbox operation denied or failed: ${result.error ?? "worker_failed"}`,
              ),
            );
          else accept(result.output ?? "");
        } catch {
          reject(
            new Error(
              "Sandbox failed to start or finish; no unconfined fallback",
            ),
          );
        }
      }
      const abort = () => {
        stop();
        finish("Sandbox operation cancelled");
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 512 * 1024) {
          stop();
          finish("Sandbox output limit exceeded");
        } else chunks.push(chunk);
      });
      child.stderr.resume();
      child.once("error", () => {
        stop();
        finish("Sandbox failed to start; no unconfined fallback");
      });
      child.once("close", (code) => finish(undefined, code));
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify({ ...request, home }));
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
