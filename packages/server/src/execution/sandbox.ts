import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { defineDoc } from "@earendil-works/pi-durable";
import {
  Connection,
  localDaemon,
  RemoteExecutionEnv,
} from "@earendil-works/pi-env";

const workspace = "/workspace";
const daemon = "/run/console/pi-env";
const home = "/home/console";

export const SandboxDoc = defineDoc<{ enabled: boolean }>({
  kind: "console.sandbox",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ enabled: false }),
  checkpointWhen: () => true,
});

function contains(root: string, path: string) {
  const difference = relative(root, path);
  return (
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    !isAbsolute(difference)
  );
}

function connectionFor(source: string, readOnly: boolean) {
  if (process.platform !== "linux")
    throw new Error("The workspace sandbox requires Linux.");
  return new Connection({
    command: [
      "/usr/bin/bwrap",
      "--unshare-all",
      "--unshare-user",
      "--disable-userns",
      "--cap-drop",
      "ALL",
      "--new-session",
      "--die-with-parent",
      "--clearenv",
      "--setenv",
      "HOME",
      home,
      "--setenv",
      "PATH",
      "/usr/bin:/bin",
      "--setenv",
      "LANG",
      "C.UTF-8",
      "--ro-bind",
      "/usr",
      "/usr",
      "--ro-bind-try",
      "/bin",
      "/bin",
      "--ro-bind-try",
      "/lib",
      "/lib",
      "--ro-bind-try",
      "/lib64",
      "/lib64",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--dir",
      home,
      "--ro-bind",
      localDaemon(),
      daemon,
      readOnly ? "--ro-bind" : "--bind",
      source,
      workspace,
      "--chdir",
      workspace,
      "--",
      daemon,
    ],
  });
}

export class WorkspaceSandboxes {
  private readonly storageDirectory: string;
  private readonly instances = new Map<
    string,
    {
      identity: string;
      connection: Connection;
      environment: RemoteExecutionEnv;
    }
  >();

  constructor(storageDirectory: string) {
    this.storageDirectory = storageDirectory;
  }

  async open(
    id: number,
    directory: string,
    readOnly: boolean,
    standalone: boolean,
  ) {
    const [source, storage, userHome] = await Promise.all([
      realpath(directory),
      realpath(this.storageDirectory),
      realpath(homedir()).catch(() => homedir()),
    ]);
    if (
      contains(source, userHome) ||
      contains(source, dirname(storage)) ||
      (!standalone && contains(storage, source))
    )
      throw new Error(
        "The sandbox workspace overlaps protected backend directories.",
      );
    const { dev, ino } = await stat(source, { bigint: true });
    const identity = `${dev}:${ino}:${source}`;
    const key = `${id}:${readOnly}`;
    let instance = this.instances.get(key);
    if (instance?.identity !== identity) {
      instance?.connection.close();
      const connection = connectionFor(source, readOnly);
      const environment = new RemoteExecutionEnv({
        connection,
        id: `console:sandbox:${key}:${identity}`,
        cwd: workspace,
        shellPath: "/bin/bash",
      });
      instance = { identity, connection, environment };
      this.instances.set(key, instance);
    }
    await instance.connection.info();
    return instance.environment;
  }

  release(id: number) {
    for (const readOnly of [true, false]) {
      const key = `${id}:${readOnly}`;
      this.instances.get(key)?.connection.close();
      this.instances.delete(key);
    }
  }

  close() {
    for (const instance of this.instances.values()) instance.connection.close();
    this.instances.clear();
  }
}
