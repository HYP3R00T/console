import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import { defineDoc } from "@earendil-works/pi-durable";

export const ConversationInfo = defineDoc<{
  name: string;
  requestId: string;
  deleted?: boolean;
}>({
  kind: "console.conversation",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ name: "", requestId: "" }),
  checkpointWhen: () => true,
});

// Atomic receipts keep a retried compact action from starting a second paid summary.
export const CompactionReceipts = defineDoc<{
  requests: Record<string, string>;
}>({
  kind: "console.compactions",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ requests: {} }),
  checkpointWhen: () => true,
});

export type AgentConfiguration = {
  provider: string;
  model: string;
  thinkingLevel?: ModelThinkingLevel;
};
