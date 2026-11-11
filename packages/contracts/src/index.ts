export { runtimePolicySchema } from "./runtime-policy.ts";

import { runtimePolicySchema } from "./runtime-policy.ts";
export type Scope =
  | "client"
  | "machine"
  | "project"
  | "session"
  | "conversation";
export type CommandDescriptor = {
  id: string;
  scope: Exclude<Scope, "client">;
  method: string;
  path: string;
  inputSchema: Record<string, unknown>;
};
export type CommandCatalog = { version: 1; commands: CommandDescriptor[] };
export const revisionSchema = { type: "string", pattern: "^[a-f0-9]{64}$" };
export const contextRetention = { min: 1000, max: 32000, step: 1000 };
export const toolSelection = {
  anyOf: [
    { type: "null" },
    {
      type: "array",
      maxItems: 100,
      uniqueItems: true,
      items: { type: "string", maxLength: 120 },
    },
  ],
};
export const instructions = {
  anyOf: [{ type: "null" }, { type: "string", maxLength: 16000 }],
};
export const conversationConfigurationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["revision"],
  properties: {
    revision: { type: "string", pattern: "^[a-f0-9]{64}$" },
    tools: toolSelection,
    managedExtensions: {
      type: "array",
      maxItems: 32,
      uniqueItems: true,
      items: {
        type: "string",
        pattern: "^user\\.[a-z][a-z0-9-]{0,63}$",
      },
    },
    instructions,
    projectTools: toolSelection,
    projectInstructions: instructions,
    workspaceGuidance: instructions,
    inspectionGuidance: instructions,
    runtimePolicy: { anyOf: [{ type: "null" }, runtimePolicySchema] },
    automaticCompaction: { type: "boolean" },
    planMode: { type: "boolean" },
    sandbox: { type: "boolean" },
    remoteProfile: {
      anyOf: [
        { type: "null" },
        { type: "string", pattern: "^[a-z][a-z0-9-]{0,23}$" },
      ],
    },
    codeMode: { type: "boolean" },
    mcp: { type: "boolean" },
    postRunRepairLimit: { type: "integer", minimum: 0, maximum: 5 },
    postRunCommand: {
      anyOf: [{ type: "null" }, { type: "string", maxLength: 1000 }],
    },
    maxTurns: {
      anyOf: [
        { type: "null" },
        {
          type: "integer",
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      ],
    },
    tokenBudget: {
      anyOf: [
        { type: "null" },
        {
          type: "integer",
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      ],
    },
    worktree: {
      anyOf: [
        { type: "null" },
        { type: "string", minLength: 1, maxLength: 4096 },
      ],
    },
    keepRecentTokens: {
      type: "integer",
      minimum: contextRetention.min,
      maximum: contextRetention.max,
      multipleOf: contextRetention.step,
    },
  },
};
export const workspaceGuidanceSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 2,
  required: ["revision", "workspaceGuidance"],
  properties: { revision: revisionSchema, workspaceGuidance: instructions },
};
export const projectAgentSettingsSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 2,
  required: ["revision"],
  properties: {
    revision: revisionSchema,
    projectTools: toolSelection,
    projectInstructions: instructions,
    inspectionGuidance: instructions,
  },
};
export const sessionRuntimeSettingsSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 2,
  required: ["revision"],
  properties: Object.fromEntries(
    [
      "revision",
      "tokenBudget",
      "keepRecentTokens",
      "automaticCompaction",
      "runtimePolicy",
    ].map((key) => [
      key,
      (conversationConfigurationSchema.properties as Record<string, unknown>)[
        key
      ],
    ]),
  ),
};
export type SettingMetadata = {
  scope: Scope;
  propagation: "local" | "shared" | "copy";
  reset: string;
  idle: "none" | "conversation" | "session";
};
export const settingMetadata = {
  "client.keybindings": {
    scope: "client",
    propagation: "local",
    reset: "Built-in bindings",
    idle: "none",
  },
  "client.theme": {
    scope: "client",
    propagation: "local",
    reset: "System theme",
    idle: "none",
  },
  "machine.workspaceGuidance": {
    scope: "machine",
    propagation: "shared",
    reset: "null restores built-in guidance",
    idle: "none",
  },
  "machine.runtimeDefaults": {
    scope: "machine",
    propagation: "copy",
    reset: "null clears new-chat defaults",
    idle: "none",
  },
  "project.instructions": {
    scope: "project",
    propagation: "shared",
    reset: "Empty instructions",
    idle: "none",
  },
  "project.inspectionGuidance": {
    scope: "project",
    propagation: "shared",
    reset: "null restores built-in guidance",
    idle: "none",
  },
  "project.tools": {
    scope: "project",
    propagation: "copy",
    reset: "null enables built-in defaults",
    idle: "none",
  },
  "session.tokenBudget": {
    scope: "session",
    propagation: "shared",
    reset: "null removes threshold",
    idle: "none",
  },
  "session.compaction": {
    scope: "session",
    propagation: "shared",
    reset: "Built-in compaction policy",
    idle: "session",
  },
  "session.runtimePolicy": {
    scope: "session",
    propagation: "shared",
    reset: "null restores defaults",
    idle: "session",
  },
  "conversation.configuration": {
    scope: "conversation",
    propagation: "local",
    reset: "Per-field defaults",
    idle: "conversation",
  },
} satisfies Record<string, SettingMetadata>;

export type {
  WorkflowDefinition,
  WorkflowRunView,
  WorkflowStep,
  WorkflowVersion,
} from "./workflows.ts";
export { workflowDefinitionSchema } from "./workflows.ts";
