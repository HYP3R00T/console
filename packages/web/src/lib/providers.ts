export type ProviderSummary = {
  id: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  authType?: "api_key" | "oauth";
  methods: { type: "api_key" | "oauth"; label: string }[];
  modelCount: number;
  favoriteCount: number;
};
export type ProviderOverview = {
  providers: ProviderSummary[];
  activeCount: number;
};
export type ProviderModel = {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  thinkingLevels: string[];
  contextWindow: number;
  maxTokens: number;
  input: string[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  favorite: boolean;
  available: boolean;
};
export type LoginView = {
  id: string;
  providerId: string;
  state: "pending" | "complete" | "error" | "cancelled";
  error?: string;
  prompt?: {
    id: string;
    type: "text" | "secret" | "select" | "manual_code";
    message: string;
    placeholder?: string;
    options?: { id: string; label: string; description?: string }[];
  };
  events: ({ id: string } & (
    | { type: "auth_url"; url: string; instructions?: string }
    | { type: "device_code"; userCode: string; verificationUri: string }
    | { type: "progress"; message: string }
    | {
        type: "info";
        message: string;
        links?: { url: string; label?: string }[];
      }
  ))[];
};
export const providerPath = (id: string) =>
  `/v1/providers/${encodeURIComponent(id)}`;
