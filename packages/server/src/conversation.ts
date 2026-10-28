import { join } from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type {
  Message,
  Models,
  ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai/models";
import {
  AgentDoc,
  createRegistry,
  Harness,
  LiveDoc,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { httpError } from "./providers.ts";

function text(message: Message) {
  return typeof message.content === "string"
    ? message.content
    : message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
}

export type AgentConfiguration = {
  provider: string;
  model: string;
  thinkingLevel?: ModelThinkingLevel;
};

export async function openConversation(models: Models, directory: string) {
  const storage = await openNodeSqliteStorage(
    join(directory, "conversation.sqlite"),
  );
  const harness = await Harness.open(
    storage,
    {
      models,
      registry: createRegistry(),
      identity: {
        attribution: {
          name: "Console",
          url: "https://github.com/HYP3R00T/console",
        },
      },
    },
    context,
  );
  const root = await harness.root(context, {
    agent: {
      tools: [],
      instructions:
        "You are Console's assistant. No filesystem or command tools are enabled. Be clear about what you cannot inspect or execute.",
    },
  });
  // Serialize configure + submit, so concurrent requests cannot change each other's model.
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = pending.then(operation);
    pending = next.catch(() => {});
    return next;
  }
  async function summary() {
    const agent = await harness.snapshot(AgentDoc, root.id, context);
    const inspection = await harness.inspect(context);
    const model = agent?.model
      ? models.getModel(agent.model.provider, agent.model.modelId)
      : undefined;
    return {
      id: String(root.id),
      model: agent?.model,
      thinkingLevel: model
        ? clampThinkingLevel(model, agent?.thinkingLevel ?? "off")
        : (agent?.thinkingLevel ?? "off"),
      status: inspection.tasks.length
        ? inspection.scheduling === "paused"
          ? "interrupted"
          : inspection.tasks.some((task) => task.state.kind === "blocked")
            ? "blocked"
            : "running"
        : "idle",
    };
  }
  async function assertIdle() {
    if ((await harness.inspect(context)).tasks.length)
      throw httpError(
        409,
        "Cancel or finish the current work before changing settings or sending another message.",
      );
  }
  return {
    summary,
    configure(input: AgentConfiguration) {
      return serialize(async () => {
        await assertIdle();
        const model = models.getModel(input.provider, input.model);
        if (!model) throw httpError(400, "Unknown model.");
        const current = await harness.snapshot(AgentDoc, root.id, context);
        const thinkingLevel =
          input.thinkingLevel ??
          clampThinkingLevel(model, current?.thinkingLevel ?? "off");
        if (!getSupportedThinkingLevels(model).includes(thinkingLevel))
          throw httpError(
            400,
            "This model does not support the selected thinking level.",
          );
        await root.configure(
          {
            model: { provider: input.provider, modelId: input.model },
            thinkingLevel,
          },
          context,
        );
        return summary();
      });
    },
    async snapshot() {
      const entries = await root.entries(
        { order: "descending" },
        100,
        undefined,
        context,
      );
      const live = await harness.snapshot(LiveDoc, root.id, context);
      const last = (
        await storage.scanSubmissions(
          { conversationId: root.id, order: "descending" },
          1,
          undefined,
          context,
        )
      ).items[0];
      return {
        ...(await summary()),
        hasOlder: Boolean(entries.next),
        messages: [...entries.items].reverse().flatMap((entry) =>
          (entry.model ?? [])
            .filter(
              (message) =>
                message.role === "user" || message.role === "assistant",
            )
            .map((message, index) => ({
              id: `${entry.id}-${index}`,
              role: message.role,
              text: text(message),
            })),
        ),
        partial: live?.generation?.message
          ? text(live.generation.message as Message)
          : "",
        outcome: last?.status === "unanswered" ? last.reason : last?.status,
      };
    },
    submit(input: { text: string; requestId: string }) {
      return serialize(async () => {
        const duplicate = await storage.submissionByRequest(
          root.id,
          input.requestId,
          context,
        );
        if (duplicate) return { id: String(duplicate.id) };
        if (!input.text.trim())
          throw httpError(400, "Message must not be blank.");
        await assertIdle();
        const agent = await summary();
        if (
          !agent.model ||
          !models.getModel(agent.model.provider, agent.model.modelId)
        )
          throw httpError(400, "Choose a model in session settings first.");
        if (!(await models.checkAuth(agent.model.provider)))
          throw httpError(400, "Configure this provider first.");
        await root.configure({ thinkingLevel: agent.thinkingLevel }, context);
        const submission = await root.submit(
          {
            type: "input",
            content: input.text,
            requestId: input.requestId,
            whenBusy: "reject",
          },
          context,
        );
        return { id: String(submission.id) };
      });
    },
    cancel: () => serialize(() => root.abort(context)),
    resume: () =>
      serialize(async () => {
        const agent = await harness.snapshot(AgentDoc, root.id, context);
        if (!agent?.model || !(await models.checkAuth(agent.model.provider)))
          throw httpError(
            400,
            "Configure the conversation's provider before resuming.",
          );
        harness.resume();
      }),
    async close() {
      await pending;
      await harness.close(context);
    },
  };
}
