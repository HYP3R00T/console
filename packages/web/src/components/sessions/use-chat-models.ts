"use client";
import { useEffect, useState } from "react";
import type { useBackendRequest } from "@/hooks/use-backend-request";
export type ChatModel = {
  provider: string;
  id: string;
  name: string;
  contextWindow?: number;
  reasoning: boolean;
  thinkingLevels: string[];
  input?: string[];
};
export type ModelRef = { provider: string; modelId: string };
export type RuntimeDefaults = { model: ModelRef; thinkingLevel?: string };
export type RuntimeDefaultsSnapshot = {
  revision: number;
  defaults: RuntimeDefaults | null;
  models: ChatModel[];
};
export const modelKey = (model: { provider: string; id: string }) =>
  JSON.stringify([model.provider, model.id]);
type ModelChoice = { key: string; level?: string };

/** Unsaved choices override the conversation's last submitted model configuration. */
export function resolveChatModelSelection(
  models: ChatModel[],
  current?: ModelRef,
  thinkingLevel?: string,
  choice?: ModelChoice,
) {
  const selected =
    choice?.key ??
    (current
      ? modelKey({ provider: current.provider, id: current.modelId })
      : models[0]
        ? modelKey(models[0])
        : undefined);
  const model = models.find((model) => modelKey(model) === selected);
  const levels = model?.thinkingLevels ?? [];
  const savedKey = current
    ? modelKey({ provider: current.provider, id: current.modelId })
    : undefined;
  const preferred =
    choice?.level ?? (selected === savedKey ? thinkingLevel : undefined);
  const level = preferred && levels.includes(preferred) ? preferred : levels[0];
  return { selected, model, level };
}

export function useChatModels(
  request: ReturnType<typeof useBackendRequest>["request"],
  current?: ModelRef,
  thinkingLevel?: string,
  useMachineDefaults = false,
) {
  const [defaults, setDefaults] = useState<RuntimeDefaults>();
  const [models, setModels] = useState<ChatModel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [choice, setChoice] = useState<ModelChoice>();
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await request<{
          models: ChatModel[];
          defaults?: RuntimeDefaults | null;
        }>(
          useMachineDefaults
            ? "/v1/machine/runtime-defaults"
            : "/v1/models/favorites",
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setModels(data.models);
          setDefaults(
            data.defaults &&
              data.models.some(
                (model) =>
                  model.provider === data.defaults?.model.provider &&
                  model.id === data.defaults.model.modelId,
              )
              ? data.defaults
              : undefined,
          );
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
  }, [request, useMachineDefaults]);
  const { selected, model, level } = resolveChatModelSelection(
    models,
    current ?? defaults?.model,
    current ? thinkingLevel : defaults?.thinkingLevel,
    choice,
  );
  return {
    models,
    loaded,
    model,
    selected,
    level,
    error,
    keyOf: modelKey,
    chooseModel: (key: string | null) => {
      if (key && key !== selected) setChoice({ key });
    },
    chooseLevel: (level: string | null) => {
      if (selected && level) setChoice({ key: selected, level });
    },
  };
}
