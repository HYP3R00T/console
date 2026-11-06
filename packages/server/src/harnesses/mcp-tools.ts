import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
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

function toolName(server: string, tool: string) {
  const raw = `mcp__${server}__${tool}`;
  if (/^[\w-]{1,64}$/.test(raw)) return raw;
  return `${raw.replace(/[^\w-]/g, "_").slice(0, 51)}_${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;
}

/** One backend-owned connection per configured server, shared by open Harnesses. */
export class McpTools {
  private readonly path: string;
  private servers: Server[] = [];
  private listeners = new Set<() => void>();
  private starting?: Promise<void>;
  private closed = false;
  private invalid = false;

  constructor(path: string) {
    this.path = path;
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

  async close() {
    this.closed = true;
    this.listeners.clear();
    await Promise.allSettled(
      this.servers.map((server) => server.client?.close()),
    );
    await this.starting;
  }

  private publish() {
    for (const listener of this.listeners) listener();
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
          throw new Error("Invalid MCP configuration file permissions.");
        const data: unknown = JSON.parse(await file.readFile("utf8"));
        if (
          !record(data) ||
          !record(data.servers) ||
          Object.keys(data.servers).length > 8
        )
          throw new Error("Invalid MCP configuration.");
        this.servers = Object.entries(data.servers).map(([name, entry]) => {
          if (
            !/^[a-z][a-z0-9-]{0,23}$/.test(name) ||
            !record(entry) ||
            typeof entry.command !== "string" ||
            !isAbsolute(entry.command) ||
            (entry.args !== undefined && !strings(entry.args)) ||
            (entry.env !== undefined &&
              (!strings(entry.env) ||
                entry.env.some(
                  (key) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key),
                ))) ||
            (entry.tools !== undefined && !strings(entry.tools))
          )
            throw new Error("Invalid MCP server definition.");
          return {
            name,
            command: entry.command,
            args: entry.args ?? [],
            env: entry.env ?? [],
            allow: entry.tools,
            tools: [],
          };
        });
      } finally {
        await file.close();
      }
      await Promise.all(this.servers.map((server) => this.connect(server)));
    } catch (error) {
      this.invalid = (error as NodeJS.ErrnoException).code !== "ENOENT";
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
