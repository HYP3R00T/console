import type { MessageAttachment } from "./attachment-list";
export type ChatMessage = {
  id: string;
  entryId: number;
  role: "user" | "assistant" | "tool";
  text: string;
  failed: boolean;
  attachments?: MessageAttachment[];
  toolName?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
};
export type QueuedInput = {
  id: number;
  content: string;
  whenBusy: "steer" | "followUp";
  attachments: { name: string }[];
};
export type HistoryWindow = { ids: number[]; before?: number };
export type Execution = {
  state:
    | "idle"
    | "running"
    | "retrying"
    | "tools"
    | "compacting"
    | "deferred"
    | "finishing";
  attempt?: number;
  retryAt?: number;
  pollAt?: number;
  failure?: { reason: string; taskId: number };
  compactionFailure?: { trigger: string };
  tools: { callId: string; name: string; status: string }[];
  compactions: {
    taskId: number;
    trigger: string;
    blocking: boolean;
    attempt: number;
    retryAt?: number;
  }[];
};
export type TranscriptChunk = {
  messages: ChatMessage[];
  history: HistoryWindow;
};
export type ChatSnapshot = {
  history: HistoryWindow;
  execution?: Execution;
  id: number;
  messages: ChatMessage[];
  busy: boolean;
  partial: string;
  activeTools?: { name: string; status: string }[];
  queued: number;
  queue?: QueuedInput[];
  hasEarlier: boolean;
  thinkingLevel?: string;
  model?: { provider: string; modelId: string };
};
