import { createHash } from "node:crypto";
import { dirname, isAbsolute } from "node:path";
import { copyJson } from "@earendil-works/chord";
import {
  defineExtension,
  defineTool,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { createToolSearchTool } from "@earendil-works/pi-durable/tool-search";
import {
  McpClient,
  StdioTransport,
  type Tool,
  toLlmContent,
} from "@earendil-works/pi-mcp";
import { SandboxDoc } from "../execution/sandbox.ts";
import { OwnerConfiguration } from "../storage/owner-configuration.ts";

export const mcpExtensionName = "console.mcp";

type Server = {
  name: string;
  command: string;
  args: string[];
  env: string[];
  allow?: string[];
  tools: ToolRegistration[];
  client?: McpClient;
  loading?: Promise<void>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export type McpConfiguration = {
  servers: Record<
    string,
    { command: string; args?: string[]; env?: string[]; tools?: string[] }
  >;
};

export function parseMcpConfiguration(value: unknown): McpConfiguration {
  if (
    !record(value) ||
    Object.keys(value).some((key) => key !== "servers") ||
    !record(value.servers) ||
    Object.keys(value.servers).length > 8
  )
    throw new Error("Invalid MCP configuration.");
  const servers = Object.fromEntries(
    Object.entries(value.servers).map(([name, entry]) => {
      if (
        !/^[a-z][a-z0-9-]{0,23}$/.test(name) ||
        !record(entry) ||
        Object.keys(entry).some(
          (key) => !["command", "args", "env", "tools"].includes(key),
        ) ||
        typeof entry.command !== "string" ||
        !isAbsolute(entry.command) ||
        entry.command.includes("\0") ||
        (entry.args !== undefined &&
          (!strings(entry.args) ||
            entry.args.some((arg) => arg.includes("\0")))) ||
        (entry.env !== undefined &&
          (!strings(entry.env) ||
            entry.env.some((key) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)))) ||
        (entry.tools !== undefined &&
          (!strings(entry.tools) ||
            entry.tools.some((tool) => !tool || tool.includes("\0"))))
      )
        throw new Error("Invalid MCP server definition.");
      return [
        name,
        {
          command: entry.command,
          ...(entry.args !== undefined && { args: entry.args }),
          ...(entry.env !== undefined && { env: entry.env }),
          ...(entry.tools !== undefined && { tools: entry.tools }),
        },
      ];
    }),
  );
  return { servers };
}

function toolName(server: string, tool: string) {
  const raw = `mcp__${server}__${tool}`;
  if (/^[\w-]{1,64}$/.test(raw)) return raw;
  return `${raw.replace(/[^\w-]/g, "_").slice(0, 51)}_${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;
}

/** One backend-owned connection per configured server, shared by open Harnesses. */
export class McpTools {
  private readonly path: string;
  private readonly configurationFile: OwnerConfiguration<McpConfiguration>;
  private servers: Server[] = [];
  private listeners = new Set<() => void>();
  private starting?: Promise<void>;
  private closed = false;
  private invalid = false;

  constructor(path: string) {
    this.path = path;
    this.configurationFile = new OwnerConfiguration(
      path,
      parseMcpConfiguration,
      { servers: {} },
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
    this.starting ??= this.load();
    return this.starting;
  }

  status() {
    return {
      invalid: this.invalid,
      servers: this.servers.map(({ name, client, tools }) => ({
        name,
        connected: client?.connectionState === "connected",
        tools: tools.length,
      })),
    };
  }

  extension() {
    return defineExtension({
      name: mcpExtensionName,
      tools: [
        createToolSearchTool(),
        ...this.servers.flatMap((server) => server.tools),
      ],
    });
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async reconnect() {
    await this.start();
    await Promise.all(this.servers.map((server) => this.connect(server)));
    return this.status();
  }

  async reload() {
    const previous = this.start();
    this.starting = previous.then(async () => {
      if (this.closed) throw new Error("MCP manager is closed.");
      await Promise.all(this.servers.map((server) => server.loading));
      const previousServers = this.servers;
      this.servers = [];
      const clients = previousServers.map((server) => {
        const client = server.client;
        server.client = undefined;
        server.tools = [];
        return client;
      });
      this.invalid = false;
      this.publish();
      await Promise.allSettled(clients.map((client) => client?.close()));
      await this.load();
      this.publish();
    });
    await this.starting;
    return this.status();
  }

  async close() {
    this.closed = true;
    this.listeners.clear();
    await Promise.allSettled(
      this.servers.map((server) => server.client?.close()),
    );
    await this.starting?.catch(() => undefined);
  }

  private publish() {
    for (const listener of this.listeners) listener();
  }

  private async load() {
    try {
      const snapshot = await this.configurationFile.read();
      this.invalid = snapshot.invalid;
      this.servers = Object.entries(snapshot.configuration?.servers ?? {}).map(
        ([name, entry]) => ({
          name,
          command: entry.command,
          args: entry.args ?? [],
          env: entry.env ?? [],
          allow: entry.tools,
          tools: [],
        }),
      );
      await Promise.all(this.servers.map((server) => this.connect(server)));
    } catch {
      this.invalid = true;
      this.servers = [];
    }
  }

  private connect(server: Server) {
    if (server.loading) return server.loading;
    if (this.closed || server.client?.connectionState === "connected") return;
    server.loading = this.openServer(server).finally(() => {
      server.loading = undefined;
    });
    return server.loading;
  }

  private async openServer(server: Server) {
    const client = new McpClient({
      name: "Console",
      version: "1.0.0",
      requestTimeoutMs: 3000,
    });
    server.client = client;
    client.onClose(() => {
      if (server.client !== client) return;
      server.client = undefined;
      server.tools = [];
      this.publish();
    });
    try {
      await client.connect(
        new StdioTransport({
          command: server.command,
          args: server.args,
          cwd: dirname(this.path),
          env: Object.fromEntries(
            server.env.flatMap((key) => {
              const value = process.env[key];
              return value === undefined ? [] : [[key, value]];
            }),
          ),
          inheritEnv: false,
          maxMessageBytes: 256 * 1024,
        }),
      );
      await this.catalog(server, client);
      client.onNotification("notifications/tools/list_changed", () => {
        void this.catalog(server, client).catch(() => undefined);
      });
    } catch {
      await client.close().catch(() => undefined);
    }
  }

  private async catalog(server: Server, client: McpClient) {
    const tools = await client.listTools({ signal: AbortSignal.timeout(3000) });
    if (server.client !== client || this.closed) return;
    const selected = tools
      .filter((tool) => !server.allow || server.allow.includes(tool.name))
      .slice(0, 50);
    const registrations = selected.map((tool) =>
      this.registration(server, client, tool),
    );
    server.tools = [
      ...new Map(registrations.map((tool) => [tool.name, tool])).values(),
    ];
    this.publish();
  }

  private registration(server: Server, client: McpClient, tool: Tool) {
    const outputSchema = record(tool.outputSchema)
      ? tool.outputSchema
      : undefined;
    return defineTool({
      name: toolName(server.name, tool.name),
      description: (typeof tool.description === "string"
        ? tool.description
        : tool.name
      ).slice(0, 2000),
      parameters: {
        ...tool.inputSchema,
        type: "object",
        properties: tool.inputSchema.properties ?? {},
      },
      deferred: true,
      replay: "unsafe",
      structuredOutputSchema: outputSchema,
      async execute(args, api, context) {
        if (
          api.env?.id.startsWith("console:ssh:") ||
          (await api.snapshot(SandboxDoc, api.conversationId, context))?.enabled
        )
          throw new Error(
            "Host MCP tools require unsandboxed local execution.",
          );
        if (server.client !== client)
          throw new Error(
            "The MCP server disconnected. Reconnect before calling again.",
          );
        try {
          const result = await client.callTool(
            tool.name,
            args as Record<string, unknown>,
            {
              signal: context.abortSignal,
              timeoutMs: 30_000,
            },
          );
          return {
            output: toLlmContent(result),
            isError: result.isError === true,
            ...(outputSchema &&
              result.structuredContent !== undefined && {
                structuredOutput: copyJson(result.structuredContent),
              }),
          };
        } catch {
          context.abortSignal?.throwIfAborted();
          throw new Error("The MCP server did not complete the call.");
        }
      },
    });
  }
}
