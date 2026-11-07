import type { ModelRef } from "@earendil-works/pi-durable";

export type AgentProfile = {
  id: string;
  name: string;
  model: ModelRef;
  thinkingLevel: string | null;
  maxTurns: number;
  tools: string[];
  instructions: string;
};

export const agentProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "name",
    "model",
    "thinkingLevel",
    "maxTurns",
    "instructions",
    "tools",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", minLength: 1, maxLength: 100 },
    model: {
      type: "object",
      additionalProperties: false,
      required: ["provider", "modelId"],
      properties: {
        provider: { type: "string", minLength: 1, maxLength: 200 },
        modelId: { type: "string", minLength: 1, maxLength: 300 },
      },
    },
    thinkingLevel: { type: ["string", "null"], maxLength: 40 },
    maxTurns: { type: "integer", minimum: 1, maximum: 50 },
    tools: {
      type: "array",
      maxItems: 200,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 200 },
    },
    instructions: { type: "string", maxLength: 16000 },
  },
};
