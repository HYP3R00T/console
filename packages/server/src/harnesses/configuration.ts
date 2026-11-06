import { createHash } from "node:crypto";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  AgentDoc,
  type Conversation,
  DEFAULT_COMPACTION_POLICY,
  type Harness,
} from "@earendil-works/pi-durable";

import type { ProjectAgentSettings } from "../projects/store.ts";
import {
  defaultInspectionGuidance,
  defaultWorkspaceGuidance,
} from "./guidance.ts";

export const contextRetention = { min: 1000, max: 32000, step: 1000 };

export type ConfigurationChange = {
  revision: string;
  tools?: string[] | null;
  instructions?: string | null;
  projectTools?: string[] | null;
  projectInstructions?: string | null;
  keepRecentTokens?: number;
  automaticCompaction?: boolean;
  workspaceGuidance?: string | null;
  inspectionGuidance?: string | null;
};

export async function conversationConfiguration(
  harness: Harness,
  conversation: Conversation,
  project?: ProjectAgentSettings,
  options?: {
    compaction: { keepRecentTokens: number; enabled: boolean };
    workspaceGuidance: string | null;
    projectName?: string;
    model: (
      provider: string,
      modelId: string,
    ) => { name: string; contextWindow: number } | undefined;
  },
) {
  const compaction = options?.compaction ?? DEFAULT_COMPACTION_POLICY;
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
        if (
          section.key !== "instructions" &&
          section.key !== "project_instructions" &&
          section.key !== "workspace_guidance" &&
          section.key !== "inspection_guidance"
        )
          rendered.push({ key: section.key, text });
      }
    }
    return rendered;
  })();
  const model =
    agent.model && options?.model(agent.model.provider, agent.model.modelId);
  return {
    revision: createHash("sha256")
      .update(
        JSON.stringify({
          tools: stored?.tools,
          instructions: stored?.instructions,
          project,
          compaction,
          workspaceGuidance: options?.workspaceGuidance,
          catalog: tools.map((tool) => tool.name),
        }),
      )
      .digest("hex"),
    tools,
    project,
    guidance: options && {
      workspace: {
        text: options.workspaceGuidance ?? defaultWorkspaceGuidance,
        customized: options.workspaceGuidance !== null,
      },
      inspection: project && {
        text: project.inspectionGuidance ?? defaultInspectionGuidance,
        customized: project.inspectionGuidance != null,
      },
      directory: agent.cwd,
      projectName: options.projectName,
    },
    context: {
      keepRecentTokens: compaction.keepRecentTokens,
      automatic: compaction.enabled,
      ...contextRetention,
      modelWindow: model?.contextWindow,
      model: agent.model && {
        name: model?.name ?? agent.model.modelId,
        provider: agent.model.provider,
        id: agent.model.modelId,
      },
    },
    toolSource: stored?.tools === undefined ? "default" : "conversation",
    instructions: stored?.instructions ?? "",
    sections,
  };
}
