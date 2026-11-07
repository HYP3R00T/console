export type PolicyValue = string | number | boolean | RuntimePolicy;
export type RuntimePolicy = { [key: string]: PolicyValue };
export type PolicyField = {
  key: string;
  label: string;
  min?: number;
  max?: number;
  choices?: [string, string][];
};
const number = (
  key: string,
  label: string,
  min = 0,
  max = 3_600_000,
): PolicyField => ({ key, label, min, max });
const choice = (
  key: string,
  label: string,
  choices: [string, string][],
): PolicyField => ({ key, label, choices });
const boolean: [string, string][] = [
  ["true", "Enabled"],
  ["false", "Disabled"],
];
const queue: [string, string][] = [
  ["all", "Together"],
  ["one-at-a-time", "One at a time"],
];
export const policyGroups = [
  {
    title: "Tools and queued input",
    fields: [
      choice("toolExecution", "Tool execution", [
        ["parallel", "Parallel"],
        ["sequential", "Sequential"],
      ]),
      choice("steeringMode", "Steering inputs", queue),
      choice("followUpMode", "Follow-up inputs", queue),
      choice("afterFailedRun", "Queued input after a failed run", [
        ["keep", "Keep waiting"],
        ["continue", "Continue"],
        ["withdraw", "Withdraw"],
      ]),
    ],
  },
  {
    title: "Retries and deadlines",
    fields: [
      choice("retry.enabled", "Retry failed generations", boolean),
      number("retry.maxRetries", "Generation retries", 0, 10),
      number("retry.baseDelayMs", "Initial retry delay (ms)", 0, 300_000),
      number("retry.maxAgentDelayMs", "Maximum agent retry delay (ms)"),
      number("stream.timeoutMs", "Request timeout (ms)", 1000),
      number("stream.maxRetries", "Provider retries per attempt", 0, 10),
      number("stream.maxRetryDelayMs", "Maximum provider retry delay (ms)"),
      number("restartLimit", "Crash restart limit", 1, 100),
    ],
  },
  {
    title: "Compaction thresholds",
    fields: [
      number(
        "compaction.reserveTokens",
        "Tokens reserved for the answer",
        0,
        2_000_000,
      ),
      number(
        "compaction.backgroundTokens",
        "Background compaction margin (tokens)",
        0,
        2_000_000,
      ),
    ],
  },
  {
    title: "Progress and memory",
    fields: [
      number(
        "progress.partialIntervalMs",
        "Answer update interval (ms)",
        0,
        60_000,
      ),
      number(
        "progress.outputIntervalMs",
        "Tool output update interval (ms)",
        0,
        60_000,
      ),
      number(
        "progress.persistWithinMs",
        "Persist progress within (ms)",
        0,
        60_000,
      ),
      number(
        "contextRetentionMs",
        "Keep idle context in memory (ms)",
        0,
        86_400_000,
      ),
      number(
        "documentRetentionMs",
        "Keep idle documents in memory (ms)",
        0,
        86_400_000,
      ),
    ],
  },
];
export const modelFields = [
  choice("enabled", "Automatic compaction for this model", boolean),
  number("reserveTokens", "Tokens reserved for the answer", 0, 2_000_000),
  number(
    "backgroundTokens",
    "Background compaction margin (tokens)",
    0,
    2_000_000,
  ),
  number("keepRecentTokens", "Recent tokens to keep", 0, 2_000_000),
];
export function fieldValue(policy: RuntimePolicy, key: string): string {
  let current: PolicyValue | undefined = policy;
  for (const part of key.split("."))
    current = typeof current === "object" ? current[part] : undefined;
  return current === undefined || typeof current === "object"
    ? ""
    : String(current);
}
export function fieldError(field: PolicyField, value: string) {
  if (value === "") return undefined;
  if (field.choices)
    return field.choices.some(([key]) => key === value)
      ? undefined
      : "Choose a listed option.";
  return /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) >= (field.min ?? 0) &&
    Number(value) <= (field.max ?? 0)
    ? undefined
    : `Enter a whole number from ${field.min} to ${field.max}.`;
}
export function applyFields(
  original: RuntimePolicy,
  fields: PolicyField[],
  values: Record<string, string>,
): RuntimePolicy {
  const result = structuredClone(original);
  for (const field of fields) {
    if (!(field.key in values)) continue;
    const value = values[field.key];
    if (fieldError(field, value)) throw new Error(`Invalid ${field.label}`);
    const parts = field.key.split(".");
    const leaf = parts.pop() as string;
    let target = result;
    for (const part of parts) {
      if (typeof target[part] !== "object") target[part] = {};
      target = target[part] as RuntimePolicy;
    }
    if (value === "") delete target[leaf];
    else
      target[leaf] =
        value === "true"
          ? true
          : value === "false"
            ? false
            : field.choices
              ? value
              : Number(value);
  }
  return result;
}
export function modelPolicies(policy: RuntimePolicy): RuntimePolicy {
  const compaction = policy.compaction;
  const overrides =
    typeof compaction === "object" ? compaction.modelOverrides : undefined;
  return typeof overrides === "object" ? overrides : {};
}
export function setModelPolicy(
  policy: RuntimePolicy,
  key: string,
  value: RuntimePolicy | null,
): RuntimePolicy {
  const overrides = { ...modelPolicies(policy) };
  if (value === null) delete overrides[key];
  else overrides[key] = value;
  return {
    ...policy,
    compaction: {
      ...(typeof policy.compaction === "object" ? policy.compaction : {}),
      modelOverrides: overrides,
    },
  };
}
