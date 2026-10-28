import { Type } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  section,
} from "@earendil-works/pi-durable";
import {
  defaultSandbox,
  SandboxDoc,
  type SandboxPolicy,
  validateSandbox,
} from "./sandbox-policy.ts";
import { runSandbox, type SandboxRequest } from "./sandbox-runner.ts";

export function sandboxExtension(privateDirectory: string) {
  function tool(
    name: string,
    description: string,
    operation: "read" | "write" | "fetch",
  ) {
    const parameters =
      operation === "fetch"
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
      ...(operation === "read" ? { replay: "safe" as const } : {}),
      async execute(args, api, context) {
        const saved =
          (await api.snapshot(SandboxDoc, api.conversationId, context)) ??
          defaultSandbox();
        const policy = await validateSandbox(saved, privateDirectory);
        const request = { ...args, operation } as SandboxRequest;
        if (
          (operation === "write" && !policy.writePaths.length) ||
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
  const fetch = tool(
    "fetch_url",
    "GET an HTTP(S) URL through the session's sandbox, returning up to 64 KiB. No backend credentials are supplied.",
    "fetch",
  );
  return {
    extension: defineExtension({
      name: "console.sandbox",
      tools: [read, write, fetch],
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
            : "No filesystem, network, or command tools are enabled.";
        }),
      ],
    }),
    tools: (policy: SandboxPolicy) =>
      policy.enabled
        ? [
            read,
            ...(policy.writePaths.length ? [write] : []),
            ...(policy.network === "unrestricted" ? [fetch] : []),
          ]
        : [],
  };
}
