import type { Provider } from "@/lib/api";
import { modelThinking } from "@/lib/chat/thinking";
export function ModelMetadata({
  model,
  full = false,
}: {
  model: Provider["models"][number];
  full?: boolean;
}) {
  const thinking = modelThinking(model);
  return (
    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] leading-4 text-muted-foreground">
      <span>
        {model.contextWindow > 0
          ? `${model.contextWindow.toLocaleString()} token context`
          : "Context unavailable"}
      </span>
      <span
        title={
          thinking.available
            ? `Supported thinking: ${thinking.levels.join(", ")}`
            : "This model has no thinking control"
        }
      >
        {!thinking.available
          ? "No thinking"
          : full
            ? `Thinking: ${thinking.levels.join(" · ")}`
            : thinking.levels.includes("off")
              ? "Thinking optional"
              : "Thinking required"}
      </span>
    </span>
  );
}
