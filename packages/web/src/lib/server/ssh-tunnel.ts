import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";
export type SshConfig = { host: string; port: number; backendPort: number };
export type Tunnel = { url: string; close: () => Promise<void> };
export function sshArguments(input: SshConfig, localPort: number) {
  if (
    input.host.length > 255 ||
    !/^(?:[a-zA-Z0-9_.-]+@)?[a-zA-Z0-9_.-]+$/.test(input.host) ||
    input.host.split("@").some((part) => part.startsWith("-")) ||
    [input.port, input.backendPort, localPort].some(
      (port) => !Number.isInteger(port) || port < 1 || port > 65535,
    )
  )
    throw new Error("Enter an SSH host/alias and valid SSH/backend ports.");
  return [
    "-N",
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "PermitLocalCommand=no",
    "-o",
    "ControlMaster=no",
    "-o",
    "ControlPath=none",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=3",
    "-L",
    `127.0.0.1:${localPort}:127.0.0.1:${input.backendPort}`,
    "-p",
    String(input.port),
    "--",
    input.host,
  ];
}
export async function startSshTunnel(input: SshConfig): Promise<Tunnel> {
  const server = createServer();
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not reserve tunnel port");
  const port = address.port;
  await new Promise<void>((accept, reject) =>
    server.close((error) => (error ? reject(error) : accept())),
  );
  const args = sshArguments(input, port);
  const env = Object.fromEntries(
    ["PATH", "HOME", "SSH_AUTH_SOCK", "LANG"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]]] : [],
    ),
  );
  const child = spawn("ssh", args, {
    env: { ...env, NODE_ENV: process.env.NODE_ENV ?? "development" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.resume();
  const cleanup = () => {
    child.kill("SIGTERM");
  };
  process.once("exit", cleanup);
  child.once("close", () => process.removeListener("exit", cleanup));
  let ended = false;
  const closed = new Promise<void>((accept) => {
    child.once("error", () => {
      ended = true;
      accept();
    });
    child.once("close", () => {
      ended = true;
      accept();
    });
  });
  const close = async () => {
    if (!ended) {
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 1000);
      try {
        await closed;
      } finally {
        clearTimeout(timer);
      }
    }
  };
  for (let n = 0; n < 100 && !ended; n++) {
    const listening = await new Promise<boolean>((accept) => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        accept(true);
      });
      socket.once("error", () => {
        socket.destroy();
        accept(false);
      });
      socket.setTimeout(100, () => {
        socket.destroy();
        accept(false);
      });
    });
    if (listening && !ended) return { url: `http://127.0.0.1:${port}`, close };
    await new Promise((accept) => setTimeout(accept, 100));
  }
  await close();
  throw new Error(
    "SSH connection failed. Check the known host, SSH key/agent, and port forwarding permissions.",
  );
}
