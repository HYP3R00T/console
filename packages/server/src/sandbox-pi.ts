// Loaded only inside the nono worker. Never receives provider models or credentials.
import { execFile } from "node:child_process";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ToolExecutionApi } from "@earendil-works/pi-durable";
import { ExecutionError, err, ok } from "@earendil-works/pi-durable/env";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-durable/tools";

export async function executePiTool(
  name: string,
  args: Record<string, unknown>,
) {
  const tool = [
    createReadTool(),
    createWriteTool(),
    createEditTool(),
    createBashTool(),
  ].find((item) => item.name === name);
  if (!tool) throw new Error("Unknown Pi coding tool");
  let output = "";
  let truncated = false;
  const diagnostics: unknown[] = [];
  const environment = new NodeExecutionEnv({ cwd: process.cwd() });
  // Keep the shell in the worker's process group. Pi's default Node executor
  // detaches it, which would evade the supervisor's group cancellation.
  environment.exec = async (command, options, context) => {
    if (typeof command !== "string")
      return err(
        new ExecutionError("spawn_error", "Only bash scripts are supported"),
      );
    return new Promise((accept) =>
      execFile(
        "/bin/bash",
        ["--noprofile", "--norc", "-c", command],
        {
          cwd: options?.cwd ?? environment.cwd,
          env: { ...process.env, ...options?.env },
          timeout: Math.min(options?.timeout ?? 110, 110) * 1000,
          maxBuffer: 65536,
          killSignal: "SIGKILL",
        },
        (error, stdout, stderr) => {
          options?.onOutput?.(stdout, context, { stream: "stdout" });
          options?.onOutput?.(stderr, context, { stream: "stderr" });
          if (error?.killed)
            accept(err(new ExecutionError("timeout", "Command timed out")));
          else
            accept(
              ok({
                exitCode: error
                  ? typeof error.code === "number"
                    ? error.code
                    : -1
                  : 0,
              }),
            );
        },
      ),
    );
  };
  // A deliberately restricted bridge: coding tools get a sandbox-local filesystem,
  // bounded output and no access to Harness documents, models, tasks or credentials.
  const bridge = {
    env: environment,
    output(chunk: string | Uint8Array) {
      output +=
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      if (Buffer.byteLength(output) > 32768) {
        output = Buffer.from(output).subarray(-32768).toString("utf8");
        truncated = true;
      }
    },
    retainedOutput: () => ({ text: output, truncated }),
    diagnostic: (value: unknown) => diagnostics.push(value),
    details: async () => {},
    agent: async () => ({}),
    models: { getModel: () => undefined },
  };
  const api = new Proxy(bridge, {
    get(target, property) {
      if (property === "outputWindow") return undefined;
      if (property in target) return Reflect.get(target, property);
      throw new Error(
        `Harness capability unavailable in sandbox: ${String(property)}`,
      );
    },
  }) as unknown as ToolExecutionApi;
  const input =
    name === "bash"
      ? { ...args, timeout: Math.min(Number(args.timeout) || 110, 110) }
      : args;
  const result = await tool.execute(input as never, api, BACKGROUND_CONTEXT);
  const structured = result.structuredOutput as
    | Record<string, unknown>
    | undefined;
  if (structured) delete structured.fullOutputPath; // Scratch files expire after this call.
  return {
    ...result,
    output: result.output ?? [{ type: "text", text: output }],
    diagnostics: [...(result.diagnostics ?? []), ...diagnostics].filter(
      (item) => (item as { code?: string }).code !== "full_output",
    ),
  };
}
