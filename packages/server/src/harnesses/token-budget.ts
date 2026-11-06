import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import type { Harness, UsageState } from "@earendil-works/pi-durable";

export const budgetReached = "The session token budget has been reached.";

export function usageTokens(usage: Readonly<UsageState>) {
  return [...Object.values(usage.models), ...Object.values(usage.tools)].reduce(
    (total, item) => total + item.totalTokens,
    0,
  );
}

export async function exceedsBudget(harness: Harness, limit: number | null) {
  return limit !== null && usageTokens(await harness.usage(context)) >= limit;
}

function rejected(model: Model<Api>, reason: string): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "error",
    errorMessage: reason,
    timestamp: Date.now(),
  };
}

export function budgetedRequests(
  models: Models,
  limit: () => number | null,
  check: (limit: number) => Promise<boolean>,
) {
  const streamSimple: Models["streamSimple"] = (model, transcript, options) => {
    const maximum = limit();
    if (maximum === null)
      return models.streamSimple(model, transcript, options);
    const output = createAssistantMessageEventStream();
    void (async () => {
      try {
        if (await check(maximum)) {
          output.push({
            type: "error",
            reason: "error",
            error: rejected(model, budgetReached),
          });
          return;
        }
        options?.signal?.throwIfAborted();
        const source = models.streamSimple(model, transcript, options);
        for await (const event of source) output.push(event);
        output.end(await source.result());
      } catch {
        output.push({
          type: "error",
          reason: "error",
          error: rejected(
            model,
            "The session model request could not be started or completed.",
          ),
        });
      }
    })();
    return output;
  };
  const completeSimple: Models["completeSimple"] = (
    model,
    transcript,
    options,
  ) =>
    limit() === null
      ? models.completeSimple(model, transcript, options)
      : streamSimple(model, transcript, options).result();
  return { streamSimple, completeSimple };
}
