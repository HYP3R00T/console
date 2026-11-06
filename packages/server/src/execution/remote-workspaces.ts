import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, posix } from "node:path";
import type { Context } from "@earendil-works/chord";
import { defineDoc } from "@earendil-works/pi-durable";
import {
  type Connection,
  nodePlatform,
  RemoteExecutionEnv,
  type SshTarget,
  sshArguments,
  sshConnection,
} from "@earendil-works/pi-env";

export const RemoteWorkspaceDoc = defineDoc<{ profile: string | null }>({
  kind: "console.remote-workspace",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ profile: null }),
  checkpointWhen: () => true,
});

type Profile = { cwd: string; target: SshTarget };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProfile(value: unknown): Profile {
  if (!record(value)) throw new Error("Invalid SSH profile.");
  const { host, hostKeyAlias, knownHostsFile, cwd, user, port, identityFile } =
    value;
  if (
    typeof host !== "string" ||
    typeof hostKeyAlias !== "string" ||
    typeof knownHostsFile !== "string" ||
    !isAbsolute(knownHostsFile) ||
    typeof cwd !== "string" ||
    !posix.isAbsolute(cwd) ||
    cwd.includes("\0") ||
    (user !== undefined && typeof user !== "string") ||
    (port !== undefined && typeof port !== "number") ||
    (identityFile !== undefined &&
      (typeof identityFile !== "string" || !isAbsolute(identityFile)))
  )
    throw new Error("Invalid SSH profile.");
  const target = {
    host,
    hostKeyAlias,
    knownHostsFile,
    user,
    port,
    identityFile,
  };
  sshArguments(target);
  return { cwd, target };
}

export class RemoteWorkspaces {
  private readonly path: string;
  private profiles = new Map<string, Profile>();
  private connections = new Map<string, Connection>();
  private loading?: Promise<void>;
  private invalid = false;

  constructor(path: string) {
    this.path = path;
  }

  start() {
    this.loading ??= this.load();
    return this.loading;
  }

  status() {
    return { profiles: [...this.profiles.keys()], invalid: this.invalid };
  }

  async environment(name: string, context: Context) {
    const profile = this.profiles.get(name);
    if (!profile)
      throw new Error("The remote workspace profile is unavailable.");
    try {
      context.abortSignal?.throwIfAborted();
      let connection = this.connections.get(name);
      if (!connection) {
        connection = sshConnection(profile.target).connection;
        this.connections.set(name, connection);
      }
      const info = await connection.info();
      if (nodePlatform(info).platform === "win32")
        throw new Error("Remote workspaces require a POSIX host.");
      const env = new RemoteExecutionEnv({
        connection,
        id: `console:ssh:${name}`,
        cwd: profile.cwd,
      });
      const directory = await env.fileInfo(env.cwd, context);
      context.abortSignal?.throwIfAborted();
      if (!directory.ok || directory.value.kind !== "directory")
        throw new Error("Remote working directory is unavailable.");
      return env;
    } catch {
      context.abortSignal?.throwIfAborted();
      throw new Error(
        "Could not open the remote workspace. Verify SSH access, the trusted host key, and the remote directory.",
      );
    }
  }

  close() {
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
  }

  private async load() {
    try {
      const file = await open(
        this.path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const info = await file.stat();
        if (
          !info.isFile() ||
          info.size > 64 * 1024 ||
          (process.getuid &&
            (info.uid !== process.getuid() || (info.mode & 0o077) !== 0))
        )
          throw new Error("Invalid SSH profile file permissions.");
        const data: unknown = JSON.parse(await file.readFile("utf8"));
        if (
          !record(data) ||
          !record(data.profiles) ||
          Object.keys(data.profiles).length > 16
        )
          throw new Error("Invalid SSH profile configuration.");
        this.profiles = new Map(
          Object.entries(data.profiles).map(([name, value]) => {
            if (!/^[a-z][a-z0-9-]{0,23}$/.test(name))
              throw new Error("Invalid SSH profile name.");
            return [name, parseProfile(value)];
          }),
        );
      } finally {
        await file.close();
      }
    } catch (error) {
      this.invalid = (error as NodeJS.ErrnoException).code !== "ENOENT";
    }
  }
}
