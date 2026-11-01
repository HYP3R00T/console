import { join } from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Models, ModelThinkingLevel } from "@earendil-works/pi-ai";
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai/models";
import { AgentDoc, createRegistry, Harness } from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { httpError } from "../http/errors.ts";
import { conversationView } from "./view.ts";

export type Configuration = {
  model: string;
  thinkingLevel?: ModelThinkingLevel;
  instructions?: string;
};
export type RuntimeReport = { type: string; taskId?: string };

// Application services own serialization and lifecycle checks. This adapter owns only Pi.
export async function openSession(
  models: Models,
  provider: string,
  directory: string,
  cwd: string,
  report: (event: RuntimeReport) => void,
) {
  const storage = await openNodeSqliteStorage(
    join(directory, "conversation.sqlite"),
  );
  const registry = createRegistry();
  registry.install(CodingTools);
  let failed = false;
  let harness: Harness;
  try {
    harness = await Harness.open(
      storage,
      {
        models,
        registry,
        env: () => new NodeExecutionEnv({ cwd }),
        onReport: (_error, info) => {
          if (info.type === "session_failed") failed = true;
          report({
            type: info.type,
            ...("task" in info ? { taskId: String(info.task?.id) } : {}),
          });
        },
        identity: {
          attribution: {
            name: "Console",
            url: "https://github.com/HYP3R00T/console",
          },
        },
      },
      context,
    );
  } catch (error) {
    await storage.close(context);
    throw error;
  }
  const root = await harness
    .root(context, {
      agent: {
        cwd,
        tools: registry
          .snapshot()
          .tools()
          .map(({ tool }) => tool),
        instructions:
          "Use the available coding tools. Report results, failures and limitations accurately.",
      },
    })
    .catch(async (error) => {
      await harness.close(context);
      throw error;
    });
  void harness.closed.then((end) => {
    if (end.reason === "failed") failed = true;
  });
  async function summary() {
    const inspection = await harness.inspect(context);
    const agent = await harness.snapshot(AgentDoc, root.id, context);
    return {
      status: inspection.tasks.length
        ? inspection.scheduling === "paused"
          ? "interrupted"
          : inspection.tasks.some((task) => task.state.kind === "blocked")
            ? "blocked"
            : "running"
        : "idle",
      model: agent?.model?.modelId,
      thinkingLevel: agent?.thinkingLevel ?? "off",
      instructions: agent?.instructions ?? "",
    };
  }
  async function idle() {
    if ((await harness.inspect(context)).tasks.length)
      throw httpError(409, "Finish or cancel this session first.");
  }
  return {
    get failed() {
      return failed;
    },
    summary,
    ...conversationView(harness, storage, root),
    async configure(input: Configuration) {
      await idle();
      const model = models.getModel(provider, input.model);
      if (!model || !(await models.checkAuth(provider)))
        throw httpError(
          400,
          "Connect the provider and choose an available model.",
        );
      const agent = await harness.snapshot(AgentDoc, root.id, context);
      const thinkingLevel =
        input.thinkingLevel ??
        clampThinkingLevel(model, agent?.thinkingLevel ?? "off");
      if (!getSupportedThinkingLevels(model).includes(thinkingLevel))
        throw httpError(400, "Thinking level is not supported by this model.");
      await root.configure(
        {
          model: { provider, modelId: input.model },
          thinkingLevel,
          ...(input.instructions === undefined
            ? {}
            : { instructions: input.instructions }),
        },
        context,
      );
    },
    async duplicate(requestId: string, text: string) {
      const prior = await storage.submissionByRequest(
        root.id,
        requestId,
        context,
      );
      if (!prior) return undefined;
      const entry = prior.entry
        ? await storage.entry(prior.entry, context)
        : undefined;
      if (entry?.entry.model?.[0]?.content !== text)
        throw httpError(409, "Request ID already belongs to different input.");
      return { id: String(prior.id) };
    },
    async submit(text: string, requestId: string) {
      await idle();
      const agent = await root.agent(context);
      if (!agent.model || !(await models.checkAuth(provider)))
        throw httpError(
          400,
          "Connect the provider and configure this session first.",
        );
      const result = await root.submit(
        { type: "input", content: text, requestId, whenBusy: "reject" },
        context,
      );
      return { id: String(result.id) };
    },
    cancel: () => root.abort(context),
    async resume() {
      const agent = await root.agent(context);
      if (!agent.model || !(await models.checkAuth(provider)))
        throw httpError(
          400,
          "Connect the provider and configure this session first.",
        );
      harness.resume();
    },
    idle,
    close: () => harness.close(context),
  };
}
