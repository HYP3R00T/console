import { createHash } from "node:crypto";
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

import { OwnerConfiguration } from "../storage/owner-configuration.ts";

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
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "host",
          "hostKeyAlias",
          "knownHostsFile",
          "cwd",
          "user",
          "port",
          "identityFile",
        ].includes(key),
    )
  )
    throw new Error("Invalid SSH profile.");
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

export type SshConfiguration = {
  profiles: Record<
    string,
    {
      cwd: string;
      host: string;
      hostKeyAlias: string;
      knownHostsFile: string;
      user?: string;
      port?: number;
      identityFile?: string;
    }
  >;
};

export function parseSshConfiguration(value: unknown): SshConfiguration {
  if (
    !record(value) ||
    Object.keys(value).some((key) => key !== "profiles") ||
    !record(value.profiles) ||
    Object.keys(value.profiles).length > 16
  )
    throw new Error("Invalid SSH configuration.");
  return {
    profiles: Object.fromEntries(
      Object.entries(value.profiles).map(([name, entry]) => {
        if (!/^[a-z][a-z0-9-]{0,23}$/.test(name))
          throw new Error("Invalid SSH profile name.");
        const { cwd, target } = parseProfile(entry);
        return [name, { cwd, ...target }];
      }),
    ),
  };
}

export class RemoteWorkspaces {
  private readonly configurationFile: OwnerConfiguration<SshConfiguration>;
  private profiles = new Map<string, Profile>();
  private connections = new Map<string, Connection>();
  private loading?: Promise<void>;
  private invalid = false;

  constructor(path: string) {
    this.configurationFile = new OwnerConfiguration(
      path,
      parseSshConfiguration,
      { profiles: {} },
    );
  }

  configuration() {
    return this.configurationFile.read();
  }

  updateConfiguration(revision: string, configuration: unknown) {
    return this.configurationFile.replace(revision, configuration, () =>
      this.reload(),
    );
  }

  start() {
    this.loading ??= this.load();
    return this.loading;
  }

  identity(name: string) {
    const profile = this.profiles.get(name);
    return profile
      ? createHash("sha256").update(JSON.stringify(profile)).digest("hex")
      : null;
  }

  status() {
    return { profiles: [...this.profiles.keys()], invalid: this.invalid };
  }

  async reload() {
    const previous = this.start();
    this.loading = previous.then(async () => {
      this.close();
      this.profiles.clear();
      this.invalid = false;
      await this.load();
    });
    await this.loading;
    return this.status();
  }

  async environment(name: string, context: Context) {
    await this.start();
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
      const snapshot = await this.configurationFile.read();
      this.invalid = snapshot.invalid;
      this.profiles = new Map(
        Object.entries(snapshot.configuration?.profiles ?? {}).map(
          ([name, value]) => [name, parseProfile(value)],
        ),
      );
    } catch {
      this.invalid = true;
      this.profiles.clear();
    }
  }
}
