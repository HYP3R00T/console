import type { Provider } from "../api.ts";

// The backend projects Pi AI's capability metadata; do not invent or filter tiers here.
export function modelThinking(
  model?: Pick<Provider["models"][number], "thinkingLevels">,
  preferred = "off",
) {
  const levels = model?.thinkingLevels ?? [];
  return {
    levels,
    available: levels.some((level) => level !== "off"),
    adjustable: levels.length > 1,
    level: levels.includes(preferred) ? preferred : (levels[0] ?? "off"),
  };
}
