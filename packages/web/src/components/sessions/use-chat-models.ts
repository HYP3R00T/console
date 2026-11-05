"use client";
import { useEffect, useState } from "react";
import type { useBackendRequest } from "@/hooks/use-backend-request";
export type ChatModel = {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  thinkingLevels: string[];
  input?: string[];
};
export type ModelRef = { provider: string; modelId: string };
const keyOf = (model: { provider: string; id: string }) =>
  JSON.stringify([model.provider, model.id]);
export function useChatModels(
  request: ReturnType<typeof useBackendRequest>["request"],
  current?: ModelRef,
  thinkingLevel?: string,
) {
  const [models, setModels] = useState<ChatModel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [choice, setChoice] = useState<{ key: string; level?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await request<{ models: ChatModel[] }>(
          "/v1/models/favorites",
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setModels(data.models);
          setLoaded(true);
          setError(undefined);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Could not load models.",
          );
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void load(), 10000);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [request]);
  const selected =
    choice?.key ??
    (current
      ? keyOf({ provider: current.provider, id: current.modelId })
      : models[0]
        ? keyOf(models[0])
        : undefined);
  const model = models.find((model) => keyOf(model) === selected);
  const levels = model?.thinkingLevels ?? [];
  const preferred = choice?.level ?? (choice ? undefined : thinkingLevel);
  const level = preferred && levels.includes(preferred) ? preferred : levels[0];
  return {
    models,
    loaded,
    model,
    selected,
    level,
    error,
    keyOf,
    chooseModel: (key: string | null) => {
      if (key) setChoice({ key });
    },
    chooseLevel: (level: string | null) => {
      if (selected && level) setChoice({ key: selected, level });
    },
  };
}
