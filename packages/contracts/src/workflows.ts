export type WorkflowStep =
  | { id: string; type: "agent"; instructions: string; next: string | null }
  | {
      id: string;
      type: "condition";
      source: string;
      contains: string;
      yes: string | null;
      no: string | null;
    }
  | {
      id: string;
      type: "approval";
      message: string;
      next: string | null;
      merge?: {
        owner: string;
        repository: string;
        number: string;
        sha: string;
        method: "merge" | "squash" | "rebase";
      };
    };

export type WorkflowDefinition = {
  name: string;
  steps: WorkflowStep[];
  trigger?:
    | { type: "cron"; expression: string; timezone: string }
    | { type: "github"; repository: string; event: string; action: string };
};

export type WorkflowVersion = {
  id: string;
  projectId: string;
  version: number;
  definition: WorkflowDefinition;
  enabled: boolean;
  sessionId: string;
  conversationId: string;
};

export type WorkflowRunView = {
  id: number;
  workflowId: string;
  version: number;
  sessionId: string;
  conversationId: string;
  status: string;
  step?: string;
  outputs: Record<string, string>;
  approval?: {
    revision: string;
    message: string;
    action?: WorkflowStep & { type: "approval" };
    decision?: "approved" | "rejected";
    invalidated?: string;
  };
  decisions?: {
    step: string;
    revision: string;
    decision: "approved" | "rejected";
    actor: string;
    at: number;
    merge?: Extract<WorkflowStep, { type: "approval" }>["merge"];
  }[];
  error?: string;
};

const text = { type: "string", maxLength: 32000 };
const id = { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" };
const next = { anyOf: [id, { type: "null" }] };
export const workflowDefinitionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "steps"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "type", "instructions", "next"],
            properties: {
              id,
              type: { const: "agent" },
              instructions: { ...text, minLength: 1 },
              next,
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "type", "source", "contains", "yes", "no"],
            properties: {
              id,
              type: { const: "condition" },
              source: id,
              contains: text,
              yes: next,
              no: next,
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "type", "message", "next"],
            properties: {
              id,
              type: { const: "approval" },
              message: { ...text, minLength: 1 },
              next,
              merge: {
                type: "object",
                additionalProperties: false,
                required: ["owner", "repository", "number", "sha", "method"],
                properties: {
                  owner: text,
                  repository: text,
                  number: text,
                  sha: text,
                  method: { enum: ["merge", "squash", "rebase"] },
                },
              },
            },
          },
        ],
      },
    },
    trigger: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "expression", "timezone"],
          properties: {
            type: { const: "cron" },
            expression: { type: "string", minLength: 1, maxLength: 120 },
            timezone: { type: "string", minLength: 1, maxLength: 100 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "repository", "event", "action"],
          properties: {
            type: { const: "github" },
            repository: {
              type: "string",
              pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
            },
            event: { enum: ["issues", "pull_request"] },
            action: { type: "string", minLength: 1, maxLength: 64 },
          },
        },
      ],
    },
  },
};
