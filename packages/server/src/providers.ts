import { randomUUID } from "node:crypto";
import type {
  AuthEvent,
  AuthPrompt,
  AuthType,
  Models,
} from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai/models";

export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export type LoginView = {
  id: string;
  provider: string;
  status: "pending" | "connected" | "failed" | "cancelled";
  events: (AuthEvent & { id: string })[];
  prompt?: {
    id: string;
    type: AuthPrompt["type"];
    message: string;
    options?: { id: string; label: string }[];
  };
};

export function createProviders(models: Models, deviceId: string) {
  let flow:
    | {
        view: LoginView;
        controller: AbortController;
        done: Promise<void>;
        answer?: (value: string) => void;
      }
    | undefined;

  async function cancel() {
    flow?.controller.abort();
    await flow?.done;
  }

  return {
    current: () => flow?.view ?? null,
    async refresh(provider: string) {
      if (!models.getProvider(provider))
        throw httpError(404, "Unknown provider.");
      const result = await models.refresh({
        providers: [provider],
        allowNetwork: true,
        force: true,
        signal: AbortSignal.timeout(30_000),
      });
      if (result.aborted || result.errors.size)
        throw httpError(
          502,
          "Could not refresh this provider's model catalog.",
        );
    },
    async list() {
      return Promise.all(
        models.getProviders().map(async (provider) => {
          let source: string | undefined;
          try {
            const auth = await models.checkAuth(provider.id);
            source = auth ? (auth.source ?? auth.type) : undefined;
          } catch {
            /* Not verified. */
          }
          return {
            id: provider.id,
            name: provider.name,
            configured: source !== undefined,
            source,
            methods: [
              ...(provider.auth.oauth
                ? [
                    {
                      type: "oauth",
                      label:
                        provider.auth.oauth.loginLabel ??
                        provider.auth.oauth.name,
                    },
                  ]
                : []),
              ...(provider.auth.apiKey?.login
                ? [{ type: "api_key", label: provider.auth.apiKey.name }]
                : []),
            ],
            models: models.getModels(provider.id).map((model) => ({
              id: model.id,
              name: model.name,
              thinkingLevels: getSupportedThinkingLevels(model),
              contextWindow: model.contextWindow,
            })),
          };
        }),
      );
    },
    start(provider: string, method: AuthType) {
      if (flow?.view.status === "pending")
        throw httpError(409, "Finish or cancel the current connection first.");
      const auth = models.getProvider(provider)?.auth;
      if (!(method === "oauth" ? auth?.oauth : auth?.apiKey?.login))
        throw httpError(400, "Unsupported provider or connection method.");
      const controller = new AbortController();
      const current = {
        view: {
          id: randomUUID(),
          provider,
          status: "pending",
          events: [],
        } as LoginView,
        controller,
        done: Promise.resolve(),
        answer: undefined as ((value: string) => void) | undefined,
      };
      flow = current;
      const timeout = setTimeout(() => controller.abort(), 10 * 60_000);
      timeout.unref();
      current.done = models
        .login(
          provider,
          method,
          {
            signal: controller.signal,
            notify(event) {
              current.view.events = [
                ...current.view.events.slice(-19),
                { ...event, id: randomUUID() },
              ];
            },
            prompt(prompt) {
              const id = randomUUID();
              current.view.prompt = {
                id,
                type: prompt.type,
                message: prompt.message,
                ...(prompt.type === "select"
                  ? { options: [...prompt.options] }
                  : {}),
              };
              return new Promise<string>((resolve, reject) => {
                function cleanup() {
                  controller.signal.removeEventListener("abort", abort);
                  prompt.signal?.removeEventListener("abort", abort);
                  if (current.view.prompt?.id === id) {
                    delete current.view.prompt;
                    current.answer = undefined;
                  }
                }
                function abort() {
                  cleanup();
                  reject(new Error("Connection cancelled"));
                }
                current.answer = (value) => {
                  cleanup();
                  resolve(value);
                };
                controller.signal.addEventListener("abort", abort, {
                  once: true,
                });
                prompt.signal?.addEventListener("abort", abort, { once: true });
                if (controller.signal.aborted || prompt.signal?.aborted)
                  abort();
              });
            },
          },
          { agentName: "Console", getDeviceId: () => deviceId },
        )
        .then(
          () => {
            current.view.status = "connected";
          },
          () => {
            current.view.status = controller.signal.aborted
              ? "cancelled"
              : "failed";
          },
        )
        .finally(() => {
          clearTimeout(timeout);
          delete current.view.prompt;
          current.view.events = [];
          current.answer = undefined;
        });
      return current.view;
    },
    get(id: string) {
      if (flow?.view.id !== id)
        throw httpError(404, "Connection attempt not found.");
      return flow.view;
    },
    answer(id: string, promptId: string, value: string) {
      if (
        flow?.view.id !== id ||
        flow.view.prompt?.id !== promptId ||
        !flow.answer
      )
        throw httpError(409, "This prompt is no longer active.");
      if (
        flow.view.prompt.type === "select" &&
        !flow.view.prompt.options?.some((option) => option.id === value)
      )
        throw httpError(400, "Choose a listed option.");
      flow.answer(value);
    },
    async disconnect(provider: string) {
      if (!models.getProvider(provider))
        throw httpError(404, "Unknown provider.");
      if (flow?.view.provider === provider) await cancel();
      await models.logout(provider);
    },
    close: cancel,
  };
}
