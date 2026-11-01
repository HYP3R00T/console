export type Provider = {
  id: string;
  name: string;
  configured: boolean;
  source?: string;
  methods: { type: "oauth" | "api_key"; label: string }[];
  models: {
    id: string;
    name: string;
    thinkingLevels: string[];
    contextWindow: number;
  }[];
};
export type Login = {
  id: string;
  provider: string;
  status: "pending" | "connected" | "failed" | "cancelled";
  events: {
    id: string;
    message?: string;
    url?: string;
    instructions?: string;
    userCode?: string;
    verificationUri?: string;
    links?: { url: string; label?: string }[];
  }[];
  prompt?: {
    id: string;
    type: string;
    message: string;
    options?: { id: string; label: string }[];
  };
};
export type Project = { id: string; name: string; path: string };
export type SessionSummary = {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  status: "idle" | "running" | "interrupted" | "blocked" | "unavailable";
  model?: string;
  thinkingLevel?: string;
  instructions?: string;
};
export type ChatMessage = {
  id: string;
  entryId: string;
  kind: string;
  role: string;
  text: string;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  reasoning?: string[];
  toolCalls?: { id: string; name: string; arguments: unknown }[];
};
export type HistoryPage = {
  messages: ChatMessage[];
  hasOlder: boolean;
  olderCursor?: string;
};
export type Session = SessionSummary &
  HistoryPage & {
    partial: string;
    liveTools: { id: string; name: string; status: string; output?: string }[];
    outcome?: string;
    compactionFailed?: boolean;
    failure?: string;
  };
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    signal,
    cache: "no-store",
    headers: {
      "x-console-request": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(
      error?.message ?? `Request failed (${response.status}).`,
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const fieldClass =
  "w-full border border-input bg-background px-3 py-2 text-sm disabled:opacity-50";
export function safeLink(value?: string) {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
