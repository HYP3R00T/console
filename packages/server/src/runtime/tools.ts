import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Conversation as PiConversation } from "@earendil-works/pi-durable";
import type { SandboxPolicy } from "../sandbox/policy.ts";

import type { Runtime } from "./context.ts";
export async function offeredTools(
  runtime: Runtime,
  root: PiConversation,
  policy: SandboxPolicy,
) {
  const { storage, registry, sandbox, coordination } = runtime;
  const record = await storage.conversation(root.id, context);
  const selected = new Set(
    (await root.agent(context)).extensions.map((extension) => extension.name),
  );
  const permitted = [
    ...sandbox.tools(policy),
    ...(coordination?.tools ?? []).filter(
      (tool) => !record?.owner || tool.name !== "subagent",
    ),
  ];
  return registry
    .snapshot()
    .tools()
    .filter(
      ({ extension, tool }) =>
        selected.has(extension.name) &&
        permitted.some((candidate) => candidate.name === tool.name),
    )
    .map(({ tool }) => tool);
}
