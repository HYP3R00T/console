import { randomUUID } from "node:crypto";
import {
  type AuthEvent,
  type AuthPrompt,
  type AuthType,
  getSupportedThinkingLevels,
  type Models,
} from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { ProviderStore } from "./store.ts";

export class ProviderError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
export type LoginView = {
  id: string;
  providerId: string;
  state: "pending" | "complete" | "cancelled" | "error";
  prompt?: {
    id: string;
    type: AuthPrompt["type"];
    message: string;
    placeholder?: string;
    options?: readonly { id: string; label: string; description?: string }[];
  };
  events: (AuthEvent & { id: string })[];
  error?: string;
};
type Flow = {
  view: LoginView;
  controller: AbortController;
  answer?: (value: string) => void;
  task?: Promise<void>;
  timer: ReturnType<typeof setTimeout>;
};

export class ProviderService {
  readonly models: Models;
  readonly store: ProviderStore;
  private flows = new Map<string, Flow>();
  private busy = new Set<string>();
  private assertIdle(id: string) {
    if (this.busy.has(id))
      throw new ProviderError(
        409,
        "Another provider update is in progress. Try again.",
      );
  }
  private async update<T>(id: string, action: () => Promise<T>): Promise<T> {
    this.assertIdle(id);
    this.busy.add(id);
    try {
      return await action();
    } finally {
      this.busy.delete(id);
    }
  }
  constructor(store: ProviderStore, models?: Models) {
    this.store = store;
    this.models =
      models ??
      builtinModels({
        credentials: store,
        modelsStore: store.catalogs,
        authContext: {
          env: async () => undefined,
          fileExists: async () => false,
        },
      });
  }
  provider(id: string) {
    const p = this.models.getProvider(id);
    if (!p) throw new ProviderError(404, "Unknown provider.");
    return p;
  }
  async overview() {
    const saved = new Map(
      (await this.store.list()).map((item) => [item.providerId, item.type]),
    );
    const providers = this.models
      .getProviders()
      .map((p) => ({
        id: p.id,
        name: p.name,
        configured: saved.has(p.id),
        enabled: this.store.enabled(p.id),
        authType: saved.get(p.id),
        methods: [
          ...(p.auth.apiKey?.login
            ? [{ type: "api_key" as const, label: "API key" }]
            : []),
          ...(p.auth.oauth
            ? [
                {
                  type: "oauth" as const,
                  label: p.auth.oauth.loginLabel ?? p.auth.oauth.name,
                },
              ]
            : []),
        ],
        modelCount: this.models.getModels(p.id).length,
        favoriteCount: this.store.favorites(p.id).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      providers,
      activeCount: providers.filter((p) => p.configured && p.enabled).length,
    };
  }
  async modelList(id: string) {
    this.provider(id);
    const favorites = new Set(this.store.favorites(id).map((m) => m.model));
    const available = new Set(
      this.store.enabled(id)
        ? (await this.models.getAvailable(id)).map((m) => m.id)
        : [],
    );
    return {
      models: this.models.getModels(id).map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        reasoning: m.reasoning,
        thinkingLevels: getSupportedThinkingLevels(m),
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        input: m.input,
        cost: m.cost,
        favorite: favorites.has(m.id),
        available: available.has(m.id),
      })),
    };
  }
  async favorites() {
    const providers = new Set(this.store.favorites().map((m) => m.provider));
    const lists = await Promise.all(
      [...providers]
        .filter((id) => this.models.getProvider(id))
        .map((id) => this.modelList(id)),
    );
    return {
      models: lists.flatMap((list) =>
        list.models.filter((m) => m.favorite && m.available),
      ),
    };
  }
  async favorite(id: string, model: string, favorite: boolean) {
    this.provider(id);
    if (!this.models.getModel(id, model))
      throw new ProviderError(404, "Unknown model.");
    return this.update(id, async () => {
      await this.store.setFavorite(id, model, favorite);
      return { favorite };
    });
  }
  async enable(id: string, enabled: boolean) {
    this.provider(id);
    return this.update(id, async () => {
      await this.stopProvider(id);
      if (!(await this.store.read(id)))
        throw new ProviderError(409, "Sign in before enabling this provider.");
      await this.store.setEnabled(id, enabled);
      return { enabled };
    });
  }
  async remove(id: string) {
    this.provider(id);
    return this.update(id, async () => {
      await this.stopProvider(id);
      await this.store.remove(id);
      return { removed: true };
    });
  }
  async refresh(id: string) {
    this.provider(id);
    return this.update(id, async () => {
      if (!this.store.enabled(id))
        throw new ProviderError(
          409,
          "Enable this provider before refreshing its catalog.",
        );
      const result = await this.models.refresh({
        providers: [id],
        signal: AbortSignal.timeout(15000),
      });
      if (result.errors.size || result.aborted)
        throw new ProviderError(
          502,
          "Could not refresh this catalog. Existing models were retained.",
        );
      return this.modelList(id);
    });
  }
  start(id: string, type: AuthType) {
    this.assertIdle(id);
    const provider = this.provider(id);
    if (
      !(type === "oauth"
        ? provider.auth.oauth?.login
        : provider.auth.apiKey?.login)
    )
      throw new ProviderError(400, "This sign-in method is unavailable.");
    if (
      [...this.flows.values()].some(
        (f) => f.view.providerId === id && f.view.state === "pending",
      )
    )
      throw new ProviderError(
        409,
        "A sign-in is already in progress for this provider.",
      );
    const controller = new AbortController();
    const view: LoginView = {
      id: randomUUID(),
      providerId: id,
      state: "pending",
      events: [],
    };
    const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    timer.unref();
    const flow: Flow = { view, controller, timer };
    this.flows.set(view.id, flow);
    flow.task = this.models
      .login(
        id,
        type,
        {
          signal: controller.signal,
          notify: (event) => {
            if (!controller.signal.aborted) {
              view.events.push({ ...event, id: randomUUID() });
              if (view.events.length > 20) view.events.shift();
            }
          },
          prompt: (prompt) =>
            new Promise<string>((resolve, reject) => {
              if (controller.signal.aborted || prompt.signal?.aborted) {
                reject(new Error("Cancelled"));
                return;
              }
              const promptId = randomUUID();
              const { signal, ...shown } = prompt;
              view.prompt = { ...shown, id: promptId };
              const close = () => {
                controller.signal.removeEventListener("abort", abort);
                signal?.removeEventListener("abort", abort);
                if (view.prompt?.id === promptId) delete view.prompt;
                delete flow.answer;
              };
              const abort = () => {
                close();
                reject(new Error("Cancelled"));
              };
              flow.answer = (value) => {
                close();
                resolve(value);
              };
              controller.signal.addEventListener("abort", abort, {
                once: true,
              });
              signal?.addEventListener("abort", abort, { once: true });
            }),
        },
        { getDeviceId: this.store.installationId, agentName: "Console" },
      )
      .then(async () => {
        if (controller.signal.aborted) {
          view.state = "cancelled";
          return;
        }
        await this.store.setEnabled(id, true);
        view.state = "complete";
      })
      .catch(() => {
        view.state = controller.signal.aborted ? "cancelled" : "error";
        if (view.state === "error")
          view.error = "Sign-in failed. Check your details and try again.";
      })
      .finally(() => {
        clearTimeout(timer);
        delete view.prompt;
        delete flow.answer;
        const cleanup = setTimeout(() => this.flows.delete(view.id), 60000);
        cleanup.unref();
      });
    return view;
  }
  login(id: string) {
    const f = this.flows.get(id);
    if (!f) throw new ProviderError(404, "Sign-in expired. Start again.");
    return f;
  }
  answer(id: string, promptId: string, value: string) {
    const f = this.login(id);
    if (
      f.view.state !== "pending" ||
      f.view.prompt?.id !== promptId ||
      !f.answer
    )
      throw new ProviderError(409, "That sign-in step has already closed.");
    if (f.view.prompt.type === "secret" && !value.trim())
      throw new ProviderError(400, "Enter the requested credential.");
    if (
      f.view.prompt.type === "select" &&
      !f.view.prompt.options?.some((o) => o.id === value)
    )
      throw new ProviderError(400, "Choose one of the listed options.");
    f.answer(value);
    return { accepted: true };
  }
  async cancel(id: string) {
    const f = this.login(id);
    if (f.view.state === "pending") f.controller.abort();
    await f.task;
    return { cancelled: true };
  }
  private async stopProvider(id: string) {
    await Promise.all(
      [...this.flows.values()]
        .filter((f) => f.view.providerId === id && f.view.state === "pending")
        .map((f) => this.cancel(f.view.id)),
    );
  }
  async close() {
    for (const f of this.flows.values()) {
      clearTimeout(f.timer);
      f.controller.abort();
    }
    await Promise.all([...this.flows.values()].map((f) => f.task));
    await this.store.close();
  }
}
