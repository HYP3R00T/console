import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Conversation } from "@earendil-works/pi-durable";
import type { Runtime } from "./context.ts";

export async function offeredTools(
  runtime: Runtime,
  root: Conversation,
  selected?: ReadonlySet<string>,
) {
  const record = await runtime.storage.conversation(root.id, context);
  const extensions =
    selected ??
    new Set((await root.agent(context)).extensions.map((item) => item.name));
  return runtime.registry
    .snapshot()
    .tools()
    .filter(
      ({ extension, tool }) =>
        extensions.has(extension.name) &&
        (!record?.owner || tool.name !== "subagent"),
    )
    .map(({ tool }) => tool);
}
