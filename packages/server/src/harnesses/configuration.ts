import { createHash } from "node:crypto";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  AgentDoc,
  type Conversation,
  type Harness,
} from "@earendil-works/pi-durable";

export async function conversationConfiguration(
  harness: Harness,
  conversation: Conversation,
) {
  const agent = await conversation.agent(context);
  const stored = await harness.snapshot(AgentDoc, conversation.id, context);
  const tools = agent.extensions.flatMap((extension) =>
    (extension.tools ?? []).map((tool) => ({
      name: tool.name,
      extension: extension.name,
      description: tool.description,
      parameters: tool.parameters,
      enabled: agent.tools.some((enabled) => enabled.name === tool.name),
    })),
  );
  const sections = await (async () => {
    const shown: Record<string, string> = {};
    const rendered: { key: string; text: string }[] = [];
    for (const section of agent.sections) {
      const text = await section.render(
        {
          conversationId: conversation.id,
          agent,
          env: undefined,
          shown,
          read: harness,
        },
        context,
      );
      if (text) {
        shown[section.key] = text;
        if (section.key !== "instructions")
          rendered.push({ key: section.key, text });
      }
    }
    return rendered;
  })();
  return {
    revision: createHash("sha256")
      .update(
        JSON.stringify({
          tools: stored?.tools,
          instructions: stored?.instructions,
          catalog: tools.map((tool) => tool.name),
        }),
      )
      .digest("hex"),
    tools,
    toolSource: stored?.tools === undefined ? "default" : "conversation",
    instructions: stored?.instructions ?? "",
    sections,
  };
}
