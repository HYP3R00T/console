import type { HarnessSettings } from "@earendil-works/pi-durable";

/** Persisted overrides; omitted fields follow Console/Durable defaults. */
export type RuntimePolicy = Pick<
  HarnessSettings,
  | "retry"
  | "toolExecution"
  | "steeringMode"
  | "followUpMode"
  | "afterFailedRun"
  | "restartLimit"
  | "progress"
  | "contextRetentionMs"
  | "documentRetentionMs"
> & {
  stream?: Pick<
    NonNullable<HarnessSettings["stream"]>,
    "timeoutMs" | "maxRetries" | "maxRetryDelayMs"
  >;
  compaction?: Pick<
    NonNullable<HarnessSettings["compaction"]>,
    "reserveTokens" | "backgroundTokens" | "modelOverrides"
  >;
};

const integer = (minimum: number, maximum: number) => ({
  type: "integer",
  minimum,
  maximum,
});
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  properties,
});
const tokens = integer(0, 2_000_000);
const thresholds = {
  reserveTokens: tokens,
  backgroundTokens: tokens,
};

export const runtimePolicySchema = object({
  retry: object({
    enabled: { type: "boolean" },
    maxRetries: integer(0, 10),
    baseDelayMs: integer(0, 300_000),
    maxAgentDelayMs: integer(0, 3_600_000),
  }),
  stream: object({
    timeoutMs: integer(1000, 3_600_000),
    maxRetries: integer(0, 10),
    maxRetryDelayMs: integer(0, 3_600_000),
  }),
  toolExecution: { enum: ["parallel", "sequential"] },
  steeringMode: { enum: ["all", "one-at-a-time"] },
  followUpMode: { enum: ["all", "one-at-a-time"] },
  afterFailedRun: { enum: ["keep", "continue", "withdraw"] },
  restartLimit: integer(1, 100),
  progress: object({
    partialIntervalMs: integer(0, 60_000),
    outputIntervalMs: integer(0, 60_000),
    persistWithinMs: integer(0, 60_000),
  }),
  contextRetentionMs: integer(0, 86_400_000),
  documentRetentionMs: integer(0, 86_400_000),
  compaction: object({
    ...thresholds,
    modelOverrides: {
      type: "object",
      maxProperties: 100,
      propertyNames: { pattern: "^[^/\\s]+/.+$", maxLength: 256 },
      additionalProperties: object({
        ...thresholds,
        keepRecentTokens: tokens,
        enabled: { type: "boolean" },
      }),
    },
  }),
});

export function runtimeSettings(policy: RuntimePolicy): HarnessSettings {
  return {
    ...policy,
    stream: { timeoutMs: 120_000, maxRetries: 0, ...policy.stream },
    retry: { maxRetries: 1, ...policy.retry },
  };
}
