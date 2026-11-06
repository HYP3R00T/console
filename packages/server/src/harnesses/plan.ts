import { isAbsolute, posix, relative, sep } from "node:path";
import {
  type AgentState,
  defineDoc,
  defineExtension,
  defineTool,
  section,
} from "@earendil-works/pi-durable";
import { err, FileError, getOrThrow } from "@earendil-works/pi-durable/env";
import { createReadTool } from "@earendil-works/pi-durable/tools";

export const PlanDoc = defineDoc<{
  markdown?: string;
  previous?: Pick<AgentState, "extensions" | "tools" | "modelTools">;
}>({
  kind: "console.plan",
  version: 1,
  scope: "conversation",
  history: "rewindable",
  fork: "asOf",
  initial: () => ({}),
  checkpointWhen: () => true,
});

const read = createReadTool();
export const workspaceRead = {
  ...read,
  description: "Read a file within the current workspace.",
  execute: (async (args, api, context) => {
    const env = api.env;
    if (!env) throw new Error("Workspace is unavailable.");
    const root = getOrThrow(await env.canonicalPath(env.cwd, context));
    const paths = env.id.startsWith("console:ssh:")
      ? posix
      : { relative, sep, isAbsolute };
    const openReader: typeof env.openBinaryReader = async (
      path,
      _,
      context,
    ) => {
      const canonical = await env.canonicalPath(path, context);
      if (!canonical.ok) return canonical;
      const inside = paths.relative(root, canonical.value);
      if (
        inside === ".." ||
        inside.startsWith(`..${paths.sep}`) ||
        paths.isAbsolute(inside)
      )
        return err(
          new FileError(
            "permission_denied",
            "Read-only agents only read files within the workspace.",
          ),
        );
      return env.openBinaryReader(canonical.value, { noFollow: true }, context);
    };
    const restricted = new Proxy(env, {
      get(target, key) {
        if (key === "openBinaryReader") return openReader;
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return read.execute(args, { ...api, env: restricted }, context);
  }) satisfies typeof read.execute,
};

const submitPlan = defineTool({
  name: "submit_plan",
  description: "Save the proposed implementation plan as Markdown.",
  parameters: {
    type: "object",
    properties: {
      markdown: { type: "string", minLength: 1, maxLength: 16000 },
    },
    required: ["markdown"],
    additionalProperties: false,
  } as const,
  replay: "safe",
  async execute(args, api, context) {
    const { markdown } = args as { markdown: string };
    if (!markdown.trim()) throw new Error("Write a plan before submitting.");
    await api.commit(async (tx) => {
      (await tx.doc(PlanDoc, api.conversationId)).markdown = markdown.trim();
    }, context);
    return {
      output: [
        { type: "text", text: "Plan saved in the conversation inspector." },
      ],
      control: { terminate: true },
    };
  },
});

export const PlanExtension = defineExtension({
  name: "console.plan",
  tools: [workspaceRead, submitPlan],
  sections: [
    section(
      "plan_mode",
      () =>
        "Inspect the workspace using read. Prepare a concrete implementation plan, then save it using submit_plan. Leave execution to the user after they exit Plan mode.",
    ),
  ],
});
