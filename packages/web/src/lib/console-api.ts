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
    type: string;
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
export type SessionSummary = {
  id: string;
  name: string;
  createdAt: string;
  status: "idle" | "running" | "interrupted" | "blocked" | "unavailable";
  model?: { provider: string; modelId: string };
  thinkingLevel?: string;
};
export type AgentConfiguration = {
  provider: string;
  model: string;
  thinkingLevel: string;
};
export type Conversation = SessionSummary & {
  sandbox: SandboxPolicy;
  thinkingLevel: string;
  hasOlder: boolean;
  messages: { id: string; role: string; text: string; toolName?: string }[];
  partial: string;
  outcome?: string;
};

export type SandboxPolicy = {
  enabled: boolean;
  workspace: string;
  readPaths: string[];
  writePaths: string[];
  network: "blocked" | "unrestricted";
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(
      error?.message ?? `Server returned ${response.status}`,
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";

export function safeLink(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
