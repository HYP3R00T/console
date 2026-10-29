import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  type SshConfig,
  sshArguments,
  startSshTunnel,
  type Tunnel,
} from "./ssh-tunnel.ts";

type Connection = {
  id: string;
  name: string;
  url: string;
  token: string;
  machineId: string;
  active: number;
  lastUsed: string;
  ssh: string | null;
};
export class ConnectionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const loopback = (url: URL) =>
  ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
const routes =
  /^(machines|connection-info|machine-settings|providers|connections|workspaces|sessions|sandbox|state)(\/|$)/;

// Owned by the web server, independently of every execution machine. Tokens never leave this module.
export function openMachineStore(path: string, tunnelFactory = startSshTunnel) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec(
    "CREATE TABLE IF NOT EXISTS machines (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE, token TEXT NOT NULL, machineId TEXT NOT NULL)",
  );
  const columns = db
    .prepare("PRAGMA table_info(machines)")
    .all()
    .map((item) => item.name);
  for (const [name, type] of [
    ["active", "INTEGER NOT NULL DEFAULT 1"],
    ["lastUsed", "TEXT NOT NULL DEFAULT ''"],
    ["ssh", "TEXT"],
  ])
    if (!columns.includes(name))
      db.exec(`ALTER TABLE machines ADD COLUMN ${name} ${type}`);
  db.exec(
    "CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)",
  );
  db.prepare("INSERT OR IGNORE INTO preferences VALUES (1, ?)").run(
    JSON.stringify({
      models: [],
      thinkingLevels: ["off", "low", "medium", "high"],
    }),
  );
  const tunnels = new Map<string, Promise<Tunnel>>();
  async function dropTunnel(id: string) {
    const value = tunnels.get(id);
    tunnels.delete(id);
    if (value) await value.then((tunnel) => tunnel.close()).catch(() => {});
  }
  async function origin(row: Connection) {
    if (!row.ssh) return row.url;
    let pending = tunnels.get(row.id);
    if (!pending) {
      pending = tunnelFactory(JSON.parse(row.ssh) as SshConfig);
      tunnels.set(row.id, pending);
      pending.catch(() => tunnels.delete(row.id));
    }
    return (await pending).url;
  }
  const status = new Map<string, string>();
  const publicInfo = (row: Connection) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    machineId: row.machineId,
    apiVersion: 1,
    local: loopback(new URL(row.url)),
    status: row.active ? (status.get(row.id) ?? "unknown") : "disconnected",
    lastUsed: row.lastUsed,
    ssh: row.ssh ? (JSON.parse(row.ssh) as SshConfig) : undefined,
  });
  function get(id: string, inactive = false) {
    const row = db.prepare("SELECT * FROM machines WHERE id=?").get(id) as
      | Connection
      | undefined;
    if (!row || (!inactive && !row.active))
      throw new ConnectionError(
        404,
        "Machine is not connected. Add its address to connect.",
      );
    return row;
  }
  async function request(
    row: Connection,
    path: string,
    method = "GET",
    body?: unknown,
    timeout = 35_000,
  ) {
    try {
      const response = await fetch(`${await origin(row)}/v1/${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
        headers: {
          "x-console-request": "1",
          ...(row.token ? { authorization: `Bearer ${row.token}` } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of response.body ?? []) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new Error("Oversized response");
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      const data = raw ? JSON.parse(raw) : undefined;
      status.set(row.id, response.status >= 500 ? "error" : "online");
      return { status: response.status, data };
    } catch {
      status.set(row.id, "offline");
      if (row.ssh) await dropTunnel(row.id);
      throw new ConnectionError(
        502,
        row.ssh
          ? "Cannot reach this machine through SSH. Check trusted hosts, SSH keys/agent, forwarding and the remote Console server."
          : "Cannot reach this machine. Check the address and whether its Console server is running.",
      );
    }
  }
  async function handshake(row: Connection) {
    const result = await request(
      row,
      "connection-info",
      "GET",
      undefined,
      5000,
    );
    if ([401, 403].includes(result.status))
      throw new ConnectionError(
        401,
        "Machine authentication failed. Enter its access token; loopback servers without a token accept an empty field.",
      );
    if (
      result.status !== 200 ||
      result.data?.product !== "console" ||
      result.data?.apiVersion !== 1 ||
      typeof result.data?.machine?.id !== "string" ||
      !result.data.machine.id ||
      typeof result.data?.machine?.name !== "string"
    )
      throw new ConnectionError(
        400,
        "This address is not a compatible Console backend (API v1). Check its URL and version.",
      );
    return result.data as {
      machine: { id: string; name: string };
      apiVersion: number;
      capabilities: string[];
      authentication: string;
    };
  }
  return {
    list() {
      return (
        db
          .prepare("SELECT * FROM machines WHERE active=1 ORDER BY name")
          .all() as Connection[]
      ).map(publicInfo);
    },
    recent() {
      return (
        db
          .prepare(
            "SELECT * FROM machines WHERE active=0 ORDER BY lastUsed DESC LIMIT 20",
          )
          .all() as Connection[]
      ).map(publicInfo);
    },
    preferences() {
      return JSON.parse(
        String(
          db.prepare("SELECT value FROM preferences WHERE id=1").get()?.value,
        ),
      ) as { models: string[]; thinkingLevels: string[] };
    },
    savePreferences(input: { models: string[]; thinkingLevels: string[] }) {
      if (
        !input ||
        !Array.isArray(input.models) ||
        input.models.length > 100 ||
        !input.models.every(
          (item) => typeof item === "string" && item.length < 500,
        ) ||
        !Array.isArray(input.thinkingLevels) ||
        !input.thinkingLevels.length ||
        !input.thinkingLevels.every((item) =>
          ["off", "minimal", "low", "medium", "high", "xhigh"].includes(item),
        )
      )
        throw new ConnectionError(
          400,
          "Select valid models and at least one thinking level.",
        );
      db.prepare("UPDATE preferences SET value=? WHERE id=1").run(
        JSON.stringify(input),
      );
      return input;
    },
    async detectLocal() {
      const url = "http://127.0.0.1:3000";
      const row: Connection = {
        id: "probe",
        url,
        name: "",
        token: "",
        machineId: "",
        active: 0,
        lastUsed: "",
        ssh: null,
      };
      const result = await request(
        row,
        "connection-info",
        "GET",
        undefined,
        3000,
      );
      status.delete("probe");
      if ([401, 403].includes(result.status))
        return { url, requiresToken: true };
      if (
        result.status !== 200 ||
        result.data?.product !== "console" ||
        result.data?.apiVersion !== 1
      )
        throw new ConnectionError(
          400,
          "No compatible local Console server found on port 3000.",
        );
      return { url, name: result.data.machine.name, requiresToken: false };
    },
    async connect(input: {
      url: string;
      name?: string;
      token?: string;
      ssh?: SshConfig;
    }) {
      if (
        typeof input.url !== "string" ||
        input.url.length > 2000 ||
        (input.name !== undefined &&
          (typeof input.name !== "string" || input.name.length > 80)) ||
        (input.token !== undefined &&
          (typeof input.token !== "string" || input.token.length > 4096))
      )
        throw new ConnectionError(
          400,
          "Enter a machine origin, optional name and access token.",
        );
      if (input.ssh) {
        try {
          sshArguments(input.ssh, 1);
          input.ssh = {
            host: input.ssh.host,
            port: input.ssh.port,
            backendPort: input.ssh.backendPort,
          };
        } catch {
          throw new ConnectionError(
            400,
            "Enter a valid SSH host/alias and ports.",
          );
        }
      }
      let url: URL;
      try {
        url = new URL(input.url);
      } catch {
        throw new ConnectionError(
          400,
          "Enter a complete machine URL, such as http://127.0.0.1:3000.",
        );
      }
      if (
        !input.ssh &&
        (url.username ||
          url.password ||
          url.search ||
          url.hash ||
          url.pathname !== "/")
      )
        throw new ConnectionError(
          400,
          "Use a server origin without a path, credentials, query or fragment.",
        );
      if (
        !input.ssh &&
        url.protocol !== "https:" &&
        !(url.protocol === "http:" && loopback(url))
      )
        throw new ConnectionError(
          400,
          "Use HTTPS or a loopback HTTP address, including an SSH tunnel.",
        );
      const token = input.token?.trim() ?? "";
      if (/[\r\n]/.test(token))
        throw new ConnectionError(400, "Invalid access token.");
      if (!input.ssh && !loopback(url) && !token)
        throw new ConnectionError(
          401,
          "A remote machine requires an access token.",
        );
      const savedUrl = input.ssh
        ? `ssh://${input.ssh.host}:${input.ssh.port}/${input.ssh.backendPort}`
        : url.origin;
      const previous = db
        .prepare("SELECT id FROM machines WHERE url=?")
        .get(savedUrl);
      const row: Connection = {
        id: previous ? String(previous.id) : randomUUID(),
        name: input.name?.trim() ?? "",
        url: savedUrl,
        active: 1,
        lastUsed: new Date().toISOString(),
        ssh: input.ssh ? JSON.stringify(input.ssh) : null,
        token,
        machineId: "",
      };
      let info: Awaited<ReturnType<typeof handshake>>;
      try {
        info = await handshake(row);
      } catch (cause) {
        await dropTunnel(row.id);
        throw cause;
      }
      row.machineId = info.machine.id;
      row.name ||= info.machine.name;
      db.prepare(
        "INSERT INTO machines (id,name,url,token,machineId,active,lastUsed,ssh) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET name=excluded.name,token=excluded.token,machineId=excluded.machineId,active=1,lastUsed=excluded.lastUsed,ssh=excluded.ssh",
      ).run(
        row.id,
        row.name,
        row.url,
        row.token,
        row.machineId,
        row.active,
        row.lastUsed,
        row.ssh,
      );
      status.set(row.id, "online");
      return publicInfo(row);
    },
    async check(id: string) {
      const row = get(id);
      const info = await handshake(row);
      if (info.machine.id !== row.machineId)
        throw new ConnectionError(
          409,
          "A different machine is at this address. Reconnect it explicitly.",
        );
      return publicInfo(row);
    },
    rename(id: string, name: string) {
      get(id);
      if (typeof name !== "string" || !name.trim() || name.length > 80)
        throw new ConnectionError(400, "Enter a name up to 80 characters.");
      db.prepare("UPDATE machines SET name=? WHERE id=?").run(name.trim(), id);
      return publicInfo(get(id));
    },
    async reconnect(id: string, token?: string) {
      const row = get(id, true);
      return this.connect({
        url: row.ssh ? "http://127.0.0.1" : row.url,
        name: row.name,
        token,
        ssh: row.ssh ? (JSON.parse(row.ssh) as SshConfig) : undefined,
      });
    },
    forget(id: string) {
      const row = get(id, true);
      if (row.active)
        throw new ConnectionError(
          409,
          "Disconnect before forgetting this machine.",
        );
      db.prepare("DELETE FROM machines WHERE id=?").run(id);
    },
    async disconnect(id: string) {
      get(id);
      db.prepare(
        "UPDATE machines SET active=0,token='',lastUsed=? WHERE id=?",
      ).run(new Date().toISOString(), id);
      status.delete(id);
      await dropTunnel(id);
    },
    proxy(id: string, path: string, method: string, body?: unknown) {
      const [pathname] = path.split("?");
      if (
        !pathname ||
        !routes.test(pathname) ||
        /[\\%]/.test(pathname) ||
        pathname.split("/").some((part) => part === "." || part === "..")
      )
        throw new ConnectionError(400, "Unsupported machine route.");
      return request(get(id), path, method, body);
    },
    close() {
      db.close();
      return Promise.all([...tunnels.keys()].map(dropTunnel));
    },
  };
}
export function machineStore() {
  const state = globalThis as typeof globalThis & {
    consoleMachineStore?: ReturnType<typeof openMachineStore>;
    consoleMachineStoreVersion?: number;
  };
  if (state.consoleMachineStoreVersion !== 2) {
    void state.consoleMachineStore?.close();
    state.consoleMachineStore = undefined;
    state.consoleMachineStoreVersion = 2;
  }
  state.consoleMachineStore ??= openMachineStore(
    join(
      process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"),
      "console-web",
      "connections.sqlite",
    ),
  );
  return state.consoleMachineStore;
}
