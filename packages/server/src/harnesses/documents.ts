import { defineDoc } from "@earendil-works/pi-durable";

// Application labels live beside Durable's transcript, never in a second transcript store.
export const ConversationInfo = defineDoc<{
  name: string;
  createdAt: string;
  lastSubmissionId?: number;
}>({
  kind: "console.conversation",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({
    name: "Conversation",
    createdAt: new Date().toISOString(),
  }),
  checkpointWhen: () => true,
});

export const SessionInfo = defineDoc<{
  nextConversation: number;
  creations?: Record<string, number>;
}>({
  kind: "console.session",
  version: 1,
  scope: "session",
  initial: () => ({ nextConversation: 2 }),
  checkpointWhen: () => true,
});
