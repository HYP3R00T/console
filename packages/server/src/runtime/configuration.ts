import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai/models";
import {
  AgentDoc,
  type Conversation as PiConversation,
} from "@earendil-works/pi-durable";
import { httpError } from "../http/errors.ts";

import type { Runtime } from "./context.ts";
import { assertIdle as requireIdle } from "./context.ts";
import type { AgentConfiguration } from "./documents.ts";
import { offeredTools } from "./tools.ts";
import { conversationSummary } from "./view.ts";
export function agentConfiguration(runtime: Runtime, root: PiConversation) {
  const { models, harness, registry, serialize } = runtime;
  const assertIdle = () => requireIdle(runtime, root);
  const summary = () => conversationSummary(runtime, root);
  return {
    selectExtension(name: string, enabled: boolean) {
      return serialize(async () => {
        await assertIdle();
        const extension = registry.snapshot().extension(name);
        if (!extension)
          throw httpError(404, "Extension is not installed on this machine.");
        const agent = await root.agent(context);
        const selected = new Set(agent.extensions.map((item) => item.name));
        if (enabled) selected.add(name);
        else selected.delete(name);
        const permitted = new Set(
          (await offeredTools(runtime, root, selected)).map(
            (tool) => tool.name,
          ),
        );
        const current = new Set(agent.tools.map((tool) => tool.name));
        await root.configure(
          {
            extensions: registry
              .snapshot()
              .installed()
              .filter((item) => selected.has(item.name)),
            tools: registry
              .snapshot()
              .tools()
              .filter(
                ({ extension: owner, tool }) =>
                  selected.has(owner.name) &&
                  permitted.has(tool.name) &&
                  (current.has(tool.name) || (enabled && owner.name === name)),
              )
              .map(({ tool }) => tool),
          },
          context,
        );
      });
    },
    manage(input: { tools: string[]; instructions?: string }) {
      return serialize(async () => {
        await assertIdle();
        const allowed = await offeredTools(runtime, root);
        if (
          input.tools.some(
            (name) => !allowed.some((tool) => tool.name === name),
          )
        )
          throw httpError(
            400,
            "Choose installed tools available to this conversation.",
          );
        await root.configure(
          {
            tools: allowed.filter((tool) => input.tools.includes(tool.name)),
            ...(input.instructions === undefined
              ? {}
              : { instructions: input.instructions }),
          },
          context,
        );
      });
    },
    configure(input: AgentConfiguration) {
      return serialize(async () => {
        await assertIdle();
        const model = models.getModel(input.provider, input.model);
        if (!model) throw httpError(400, "Unknown model.");
        if (!(await models.checkAuth(input.provider)))
          throw httpError(
            400,
            "Connect this provider before selecting its model.",
          );
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
  };
}
