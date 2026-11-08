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

export { runtimePolicySchema } from "@console/contracts";

export function runtimeSettings(policy: RuntimePolicy): HarnessSettings {
  return {
    ...policy,
    stream: { timeoutMs: 120_000, maxRetries: 0, ...policy.stream },
    retry: { maxRetries: 1, ...policy.retry },
  };
}
