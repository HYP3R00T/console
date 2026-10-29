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
  workspace?: string;
  workspaceId?: string | null;
  enabledTools?: string[];
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
  plan?: {
    title: string;
    steps: { step: string; status: "pending" | "in_progress" | "completed" }[];
    sourceEntryId: string;
  };
  queue?: { id: string; mode: "steer" | "followUp"; text: string }[];
  usage?: {
    models: Record<string, RecordedUsage>;
    tools: Record<string, RecordedUsage>;
  };
  contextUsage?: {
    estimatedTokens: number;
    capacity: number;
    reserveTokens: number;
    backgroundTokens: number;
  };
  compactions?: {
    id: string;
    reason: string;
    blocking: boolean;
    attempt: number;
    retryAt?: number;
  }[];
  compactionFailed?: boolean;
  liveTools?: { id: string; name: string; status: string; output?: string }[];
  sandbox: SandboxPolicy;
  thinkingLevel: string;
  hasOlder: boolean;
  olderCursor?: string;
  messages: {
    id: string;
    role: string;
    text: string;
    toolName?: string;
    toolCallId?: string;
    isError?: boolean;
    entryId?: string;
    kind?: string;
    toolCalls?: {
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }[];
    reasoning?: ReasoningPart[];
  }[];
  partial: string;
  conversationId?: string;
  partialReasoning?: ReasoningPart[];
  partialId?: string;
  outcome?: string;
};

export type RecordedUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  reasoning?: number;
  cost: { total: number };
};

export type MessageMode = "reject" | "steer" | "followUp";

export type ReasoningPart = { id: string; text: string; streaming: boolean };

export type SandboxPolicy = {
  enabled: boolean;
  commands?: boolean;
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
  machineId?: string,
): Promise<T> {
  const backend =
    machineId ??
    (typeof window === "undefined"
      ? ""
      : sessionStorage.getItem("console.backend") || "");
  const registry = path === "/backends" || path.startsWith("/backends/");
  if (!registry && !backend)
    throw new ApiError(
      "Connect a machine before opening its projects or sessions.",
      409,
    );
  const target = registry
    ? `/api/machines${path.slice("/backends".length)}`
    : `/api/machines/${encodeURIComponent(backend)}/api${path}`;
  const response = await fetch(target, {
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
  "w-full rounded-none border border-input bg-background px-3 py-2 text-sm focus-visible:outline-1 focus-visible:outline-ring disabled:opacity-50";

export function safeLink(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export type Machine = {
  id: string;
  name: string;
  local: boolean;
  platform: string;
  architecture: string;
  status: string;
  sessions: number;
  activeSessions: number;
  unavailableSessions: number;
  storage: {
    directory: string;
    source: string;
    credentials: string;
    catalog: string;
    sessions: string;
    restartRequired: boolean;
  };
  capabilities: {
    remoteMachines: boolean;
    shell: boolean;
    sandboxedFiles: boolean;
  };
};

export type BackendConnection = {
  ssh?: { host: string; port: number; backendPort: number };
  lastUsed?: string;
  machineId?: string;
  apiVersion?: number;
  id: string;
  name: string;
  url?: string;
  local: boolean;
  status: string;
};
export type Workspace = {
  isDefault?: number;
  id: string;
  name: string;
  path: string;
  repository?: string | null;
  error?: string | null;
  state?: string;
  deleted?: number;
};
export type ConversationSummary = {
  isMain?: boolean;
  parentId?: string;
  kind?: "root" | "fork" | "subagent";
  id: string;
  name: string;
  status: string;
  model?: { provider: string; modelId: string };
};

export type AgentInspection = {
  tools: {
    name: string;
    description: string;
    parameters: unknown;
    replay: string;
    extension: string;
    enabled: boolean;
    permitted: boolean;
  }[];
  extensions: {
    enabled: boolean;
    name: string;
    tools: string[];
    sections: number;
    hooks: number;
  }[];
  instructions: string;
  tasks: { id: string; name: string; state: string }[];
  taskGraph?: {
    id: string;
    name: string;
    conversationId: string;
    owner?: string;
    background: boolean;
    abortRequested: boolean;
    state: string;
    waitingOn: string[];
    wakeAt?: number;
    blockedReason?: string;
  }[];
  scheduling: string;
};
