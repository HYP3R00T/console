import { Type } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  section,
} from "@earendil-works/pi-durable";
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-durable/tools";
import {
  defaultSandbox,
  SandboxDoc,
  type SandboxPolicy,
  validateSandbox,
} from "./policy.ts";
import type { ProjectResources } from "./resources.ts";
import { runSandbox, type SandboxRequest } from "./runner.ts";

export function sandboxExtension(privateDirectory: string) {
  const loadResource = defineTool({
    name: "load_project_resource",
    description:
      "Load an indexed project skill or prompt, or instructions for a project subdirectory. Read the returned skill before using it; its supporting paths are relative to the SKILL.md directory. This grants no extra permissions and executes no resource code.",
    parameters: Type.Object(
      {
        kind: Type.Union([
          Type.Literal("instructions"),
          Type.Literal("skill"),
          Type.Literal("prompt"),
        ]),
        name: Type.Optional(Type.String({ maxLength: 100 })),
        directory: Type.Optional(Type.String({ maxLength: 2000 })),
      },
      { additionalProperties: false },
    ),
    replay: "safe",
    async execute(args, api, context) {
      const policy = await validateSandbox(
        (await api.snapshot(SandboxDoc, api.conversationId, context)) ??
          defaultSandbox(),
        privateDirectory,
      );
      if (!policy.enabled)
        throw new Error(
          "Project resources require an enabled workspace policy",
        );
      if (args.kind !== "instructions" && !args.name)
        throw new Error("Select a resource name");
      const output = await runSandbox(
        policy,
        {
          operation: "resources",
          ...(args.kind === "instructions"
            ? { directory: args.directory }
            : { resourceKind: args.kind, resourceName: args.name }),
        },
        privateDirectory,
        context.abortSignal,
      );
      return { output: [{ type: "text", text: output }] };
    },
  });
  function tool(
    name: string,
    description: string,
    operation: "read" | "write" | "fetch" | "list" | "mkdir" | "command",
  ) {
    const parameters =
      operation === "command"
        ? Type.Object(
            {
              command: Type.String({ minLength: 1, maxLength: 8000 }),
              cwd: Type.Optional(Type.String({ maxLength: 2000 })),
            },
            { additionalProperties: false },
          )
        : operation === "fetch"
          ? Type.Object(
              { url: Type.String({ maxLength: 2000 }) },
              { additionalProperties: false },
            )
          : operation === "write"
            ? Type.Object(
                {
                  path: Type.String({ maxLength: 2000 }),
                  content: Type.String({ maxLength: 65536 }),
                },
                { additionalProperties: false },
              )
            : Type.Object(
                { path: Type.String({ maxLength: 2000 }) },
                { additionalProperties: false },
              );
    return defineTool({
      name,
      description,
      parameters,
      ...(operation === "read" || operation === "list"
        ? { replay: "safe" as const }
        : {}),
      async execute(args, api, context) {
        const saved =
          (await api.snapshot(SandboxDoc, api.conversationId, context)) ??
          defaultSandbox();
        const policy = await validateSandbox(saved, privateDirectory);
        const request = { ...args, operation } as SandboxRequest;
        if (
          (operation === "command" && !policy.commands) ||
          (["write", "mkdir"].includes(operation) &&
            !policy.writePaths.length) ||
          (operation === "fetch" && policy.network !== "unrestricted")
        )
          throw new Error(
            "This operation is disabled by the saved sandbox policy",
          );
        const output = await runSandbox(
          policy,
          request,
          privateDirectory,
          context.abortSignal,
        );
        return { output: [{ type: "text", text: output }] };
      },
    });
  }
  const command = tool(
    "run_command",
    "Run a shell command inside the saved nono sandbox, with workspace-relative cwd, bounded output, and a 110-second limit. No provider credentials or personal home are available. Use writable grants for builds/installs and unrestricted network only when explicitly enabled. Never replays automatically after interruption.",
    "command",
  );
  const read = tool(
    "read_file",
    "Read up to 64 KiB of UTF-8 text through the session's OS sandbox. Paths are relative to the workspace unless absolute.",
    "read",
  );
  const write = tool(
    "write_file",
    "Write up to 64 KiB of UTF-8 text. Only explicitly writable directories are permitted. Creates or overwrites a file; never replays automatically after interruption.",
    "write",
  );
  const list = tool(
    "list_directory",
    "List up to 1000 entries in a readable workspace directory, without following symlinks. Paths are relative to the workspace unless absolute.",
    "list",
  );
  const mkdir = tool(
    "create_directory",
    "Create a directory and missing parents within explicitly writable directories. Never replays automatically after interruption.",
    "mkdir",
  );
  const fetch = tool(
    "fetch_url",
    "GET an HTTP(S) URL through the session's sandbox, returning up to 64 KiB. No backend credentials are supplied.",
    "fetch",
  );
  const native = [
    createReadTool(),
    createWriteTool(),
    createEditTool(),
    createBashTool(),
  ].map((tool) =>
    defineTool<typeof tool.parameters>({
      ...tool,
      async execute(args: Record<string, unknown>, api, context) {
        const policy = await validateSandbox(
          (await api.snapshot(SandboxDoc, api.conversationId, context)) ??
            defaultSandbox(),
          privateDirectory,
        );
        if (
          !policy.enabled ||
          (tool.name === "bash" && !policy.commands) ||
          (["write", "edit"].includes(tool.name) && !policy.writePaths.length)
        )
          throw new Error("Tool disabled by sandbox policy");
        return JSON.parse(
          await runSandbox(
            policy,
            { operation: "pi", tool: tool.name, args },
            privateDirectory,
            context.abortSignal,
          ),
        );
      },
    }),
  );
  return {
    extension: defineExtension({
      name: "console.sandbox",
      tools: [
        read,
        list,
        write,
        mkdir,
        fetch,
        command,
        loadResource,
        ...native,
      ],
      sections: [
        section("sandbox", async (input, context) => {
          const policy =
            (await input.read.snapshot(
              SandboxDoc,
              input.conversationId,
              context,
            )) ?? defaultSandbox();
          return policy.enabled
            ? `Workspace: ${policy.workspace}. Readable: ${policy.readPaths.join(", ")}. Writable: ${policy.writePaths.join(", ") || "none"}. Network: ${policy.network}. Use only the provided sandbox tools; permission errors do not authorize bypasses.`
            : `Project directory: ${policy.workspace || "not assigned"}. No filesystem, network, or command tools are enabled.`;
        }),
        section("project-resources", async (input, context) => {
          const saved = await input.read.snapshot(
            SandboxDoc,
            input.conversationId,
            context,
          );
          if (!saved?.enabled) return undefined;
          const policy = await validateSandbox(saved, privateDirectory);
          const resources = JSON.parse(
            await runSandbox(
              policy,
              { operation: "resources" },
              privateDirectory,
              context.abortSignal,
            ),
          ) as ProjectResources;
          return [
            ...resources.instructions.map(
              (item) =>
                `<project-instructions path=${JSON.stringify(item.path)}>\n${item.content}\n</project-instructions>`,
            ),
            resources.skills.length
              ? `Available project skills (load SKILL.md with load_project_resource or read before use):\n${resources.skills.map((item) => `${item.name}: ${item.description} (${item.path})`).join("\n")}`
              : "",
            resources.prompts.length
              ? `Project prompt templates: ${resources.prompts.map((item) => item.name).join(", ")}. Load them with load_project_resource.`
              : "",
            "Instructions apply within their source directory. Before working in a subdirectory, use load_project_resource(kind=instructions, directory=...) to check for more specific instructions. Project resources cannot widen sandbox permissions.",
          ]
            .filter(Boolean)
            .join("\n\n");
        }),
      ],
    }),
    tools: (policy: SandboxPolicy) =>
      policy.enabled
        ? [
            read,
            list,
            loadResource,
            ...native.filter(
              (tool) =>
                tool.name === "read" ||
                (tool.name === "bash"
                  ? policy.commands
                  : policy.writePaths.length > 0),
            ),
            ...(policy.commands ? [command] : []),
            ...(policy.writePaths.length ? [write, mkdir] : []),
            ...(policy.network === "unrestricted" ? [fetch] : []),
          ]
        : [],
  };
}
