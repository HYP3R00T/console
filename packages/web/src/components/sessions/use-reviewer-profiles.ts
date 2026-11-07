"use client";
import { useEffect, useState } from "react";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import type { ChatModel, ModelRef } from "./use-chat-models";

export type ReviewerProfile = {
  id: string;
  name: string;
  model: ModelRef;
  thinkingLevel: string | null;
  maxTurns: number;
  passes?: number;
  tools?: string[];
  instructions: string;
};
export type ReviewerProfiles = {
  revision: number;
  profiles: ReviewerProfile[];
  models: ChatModel[];
};
export const reviewerProfilesPath = "/v1/machine/reviewer-profiles";
export function useReviewerProfiles(
  request: ReturnType<typeof useBackendRequest>["request"],
  kind: "reviewer" | "agent" = "reviewer",
) {
  const [snapshot, setSnapshot] = useState<ReviewerProfiles>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await request<ReviewerProfiles>(
          `/v1/machine/${kind}-profiles`,
          {
            signal: controller.signal,
          },
        );
        if (!controller.signal.aborted) {
          setSnapshot((current) =>
            current && current.revision > next.revision ? current : next,
          );
          setError(undefined);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : `Could not load ${kind} profiles.`,
          );
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void load(), 10000);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [request, kind]);
  return { snapshot, setSnapshot, error };
}
