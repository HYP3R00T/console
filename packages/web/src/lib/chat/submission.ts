import type { AgentConfiguration, Conversation } from "../api.ts";

export type MessageSubmission = {
  text: string;
  requestId: string;
  whenBusy?: "reject" | "steer" | "followUp";
  configuration?: AgentConfiguration;
  configurationApplied?: boolean;
};
export function sameConfiguration(
  a?: AgentConfiguration,
  b?: AgentConfiguration,
) {
  return (
    a?.provider === b?.provider &&
    a?.model === b?.model &&
    a?.thinkingLevel === b?.thinkingLevel
  );
}
export function savedConfiguration(
  conversation: Pick<Conversation, "model" | "thinkingLevel">,
): AgentConfiguration | undefined {
  return conversation.model
    ? {
        provider: conversation.model.provider,
        model: conversation.model.modelId,
        thinkingLevel: conversation.thinkingLevel,
      }
    : undefined;
}
// A draft is local until Send. Remember confirmed configuration separately from uncertain message admission.
export async function submitDraft(
  path: string,
  draft: MessageSubmission,
  current: Pick<Conversation, "model" | "thinkingLevel" | "status">,
  write: (
    path: string,
    method: "PATCH" | "POST",
    body: unknown,
  ) => Promise<unknown>,
  configurationApplied: () => void,
) {
  if (!draft.configurationApplied) {
    if (
      draft.configuration &&
      !sameConfiguration(draft.configuration, savedConfiguration(current))
    ) {
      if (current.status !== "idle")
        throw new Error(
          "Wait for the current work to finish before sending with a different model or thinking level.",
        );
      await write(`${path}/config`, "PATCH", draft.configuration);
    }
    configurationApplied();
  }
  const { text, requestId, whenBusy } = draft;
  return write(`${path}/messages`, "POST", {
    text,
    requestId,
    ...(whenBusy ? { whenBusy } : {}),
  });
}
