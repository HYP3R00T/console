import type { Conversation } from "../api.ts";

export function contextEstimate(usage?: Conversation["contextUsage"]) {
  if (
    !usage ||
    !Number.isFinite(usage.estimatedTokens) ||
    usage.estimatedTokens < 0 ||
    !Number.isFinite(usage.capacity) ||
    usage.capacity <= 0
  )
    return undefined;
  const percent = (usage.estimatedTokens / usage.capacity) * 100;
  if (!Number.isFinite(percent)) return undefined;
  return {
    used: usage.estimatedTokens,
    capacity: usage.capacity,
    fill: Math.min(100, percent),
    label:
      percent > 0 && percent < 0.1
        ? "<0.1%"
        : `${Math.round(percent * 10) / 10}%`,
  };
}
