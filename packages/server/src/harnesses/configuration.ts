import { createHash } from "node:crypto";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { estimateContextTokens } from "@earendil-works/pi-ai/utils/estimate";
import {
  AgentDoc,
  type Conversation,
  DEFAULT_COMPACTION_POLICY,
  type Harness,
  UsageDoc,
} from "@earendil-works/pi-durable";
import {
  RemoteWorkspaceDoc,
  type RemoteWorkspaces,
} from "../execution/remote-workspaces.ts";
import { SandboxDoc } from "../execution/sandbox.ts";
import type { ProjectAgentSettings } from "../projects/store.ts";
import { advancedToolsName } from "./advanced-tools.ts";
import {
  defaultInspectionGuidance,
  defaultWorkspaceGuidance,
} from "./guidance.ts";
import { type McpTools, mcpExtensionName } from "./mcp-tools.ts";
import { PlanDoc } from "./plan.ts";
import { PostRunDoc } from "./post-run.ts";
import { usageTokens } from "./token-budget.ts";

export const contextRetention = { min: 1000, max: 32000, step: 1000 };

export type ConfigurationChange = {
  revision: string;
  tools?: string[] | null;
  instructions?: string | null;
  projectTools?: string[] | null;
  projectInstructions?: string | null;
  keepRecentTokens?: number;
  automaticCompaction?: boolean;
  maxTurns?: number | null;
  planMode?: boolean;
  postRunCommand?: string | null;
  tokenBudget?: number | null;
  worktree?: string | null;
  sandbox?: boolean;
  remoteProfile?: string | null;
  codeMode?: boolean;
  mcp?: boolean;
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
    tokenBudget: number | null;
    worktree?: string | null;
    mcp?: ReturnType<McpTools["status"]>;
    remote?: ReturnType<RemoteWorkspaces["status"]>;
    model: (
      provider: string,
      modelId: string,
    ) => { name: string; contextWindow: number } | undefined;
  },
) {
  const compaction = options?.compaction ?? DEFAULT_COMPACTION_POLICY;
  const agent = await conversation.agent(context);
  const stored = await harness.snapshot(AgentDoc, conversation.id, context);
  const sandbox = !!(
    await harness.snapshot(SandboxDoc, conversation.id, context)
  )?.enabled;
  const remoteProfile =
    (await harness.snapshot(RemoteWorkspaceDoc, conversation.id, context))
      ?.profile ?? null;
  const plan = await harness.snapshot(PlanDoc, conversation.id, context);
  const previousExtensions = plan?.previous?.extensions;
  const postRunCommand =
    (await harness.snapshot(PostRunDoc, conversation.id, context))?.command ??
    null;
  const catalog = agent.extensions.flatMap((extension) =>
    (extension.tools ?? []).map((tool) => ({
      name: tool.name,
      extension: extension.name,
      description: tool.description,
      parameters: tool.parameters,
      enabled: [...agent.tools, ...agent.deferred, ...agent.callable].some(
        (enabled) => enabled.name === tool.name,
      ),
      deferred: agent.deferred.some((enabled) => enabled.name === tool.name),
    })),
  );
  const tools = [...new Map(catalog.map((tool) => [tool.name, tool])).values()];
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
  const active = await conversation.context(context);
  const usage = await harness.snapshot(UsageDoc, conversation.id, context);
  const recorded = [
    ...Object.values(usage?.models ?? {}),
    ...Object.values(usage?.tools ?? {}),
  ];
  const tokenBudget = options?.tokenBudget ?? null;
  return {
    revision: createHash("sha256")
      .update(
        JSON.stringify({
          tools: stored?.tools,
          instructions: stored?.instructions,
          maxTurns: stored?.maxTurns,
          planMode: !!plan?.previous,
          postRunCommand,
          tokenBudget,
          worktree: options?.worktree,
          sandbox,
          remoteProfile,
          extensions: stored?.extensions,
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
      directory: options.worktree ?? agent.cwd,
      projectName: options.projectName,
    },
    context: {
      keepRecentTokens: compaction.keepRecentTokens,
      automatic: compaction.enabled,
      ...contextRetention,
      modelWindow: model?.contextWindow,
      estimatedContextTokens: estimateContextTokens(active.messages).tokens,
      usage: recorded.length
        ? {
            tokens: recorded.reduce(
              (total, item) => total + item.totalTokens,
              0,
            ),
            cost: recorded.reduce((total, item) => total + item.cost.total, 0),
          }
        : null,
      maxTurns: agent.maxTurns ?? null,
      tokenBudget,
      sessionTokens:
        tokenBudget === null
          ? undefined
          : usageTokens(await harness.usage(context)),
      model: agent.model && {
        name: model?.name ?? agent.model.modelId,
        provider: agent.model.provider,
        id: agent.model.modelId,
      },
    },
    toolSource: stored?.tools === undefined ? "default" : "conversation",
    plan: { active: !!plan?.previous, markdown: plan?.markdown },
    postRunCommand,
    worktree: options?.worktree,
    sandbox: process.platform === "linux" || sandbox ? sandbox : undefined,
    remote: options?.remote && { ...options.remote, profile: remoteProfile },
    codeMode: agent.extensions.some(
      (extension) => extension.name === advancedToolsName,
    ),
    mcpEnabled: agent.extensions.some(
      (extension) => extension.name === mcpExtensionName,
    ),
    mcpSuspended:
      (Array.isArray(previousExtensions)
        ? previousExtensions
        : previousExtensions?.add
      )?.includes(mcpExtensionName) ?? false,
    mcp: options?.mcp,
    instructions: stored?.instructions ?? "",
    sections,
  };
}
