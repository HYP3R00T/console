import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai/models";
import {
  AgentDoc,
  configure,
  type Conversation as PiConversation,
} from "@earendil-works/pi-durable";
import { httpError } from "../http/errors.ts";
import {
  defaultSandbox,
  SandboxDoc,
  type SandboxPolicy,
  validateSandbox,
} from "../sandbox/policy.ts";
import { runSandbox } from "../sandbox/runner.ts";

import type { Runtime } from "./context.ts";
import { assertIdle as requireIdle } from "./context.ts";
import type { AgentConfiguration } from "./documents.ts";
import { offeredTools } from "./tools.ts";
import { conversationSummary } from "./view.ts";
export function agentConfiguration(runtime: Runtime, root: PiConversation) {
  const {
    models,
    storage,
    harness,
    registry,
    sandbox,
    coordination,
    serialize,
    privateDirectory,
  } = runtime;
  const assertIdle = () => requireIdle(runtime, root);
  const offered = (policy: SandboxPolicy) =>
    offeredTools(runtime, root, policy);
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
        const policy =
          (await harness.snapshot(SandboxDoc, root.id, context)) ??
          defaultSandbox();
        const record = await storage.conversation(root.id, context);
        const permitted = [
          ...sandbox.tools(policy),
          ...(coordination?.tools ?? []).filter(
            (tool) => !record?.owner || tool.name !== "subagent",
          ),
        ];
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
                  permitted.some((candidate) => candidate.name === tool.name) &&
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
        const policy =
          (await harness.snapshot(SandboxDoc, root.id, context)) ??
          defaultSandbox();
        const allowed = await offered(policy);
        if (
          input.tools.some(
            (name) => !allowed.some((tool) => tool.name === name),
          )
        )
          throw httpError(
            400,
            "Enable the required sandbox grants before selecting those tools.",
          );
        await root.configure(
          {
            tools: allowed.filter((tool) => input.tools.includes(tool.name)),
            ...(input.instructions === undefined
              ? (await root.agent(context)).instructions ===
                "You are Console's assistant. No filesystem or command tools are enabled. Be clear about what you cannot inspect or execute."
                ? {
                    instructions:
                      "You are Console's assistant. Use available tools and report limitations accurately. Delegate only when asked.",
                  }
                : {}
              : { instructions: input.instructions }),
          },
          context,
        );
      });
    },
    configureSandbox(input: SandboxPolicy) {
      return serialize(async () => {
        await assertIdle();
        const policy = await validateSandbox(input, privateDirectory);
        if (policy.enabled) {
          try {
            await runSandbox(policy, { operation: "check" }, privateDirectory);
          } catch {
            throw httpError(
              400,
              "Sandbox could not be applied. Check nono/kernel support and path grants; the previous policy is unchanged.",
            );
          }
        }
        const tools = await offered(policy);
        const current = await root.agent(context);
        await root.commit(async (tx) => {
          Object.assign(await tx.doc(SandboxDoc, root.id), policy);
          await configure(tx, root.id, {
            tools,
            cwd: policy.enabled ? policy.workspace : null,
            instructions:
              current.instructions ===
              "You are Console's assistant. No filesystem or command tools are enabled. Be clear about what you cannot inspect or execute."
                ? "You are Console's assistant. Use available tools and accurately report what you inspected or changed. Delegate only when asked."
                : current.instructions,
          });
        }, context);
        return policy;
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
