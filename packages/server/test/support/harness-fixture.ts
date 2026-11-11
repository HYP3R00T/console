import { join } from "node:path";
import { createModels, fauxProvider } from "@earendil-works/pi-ai";
import { createApp } from "../../src/app.ts";
import { HarnessService } from "../../src/harnesses/service.ts";
import { HarnessStore } from "../../src/harnesses/store.ts";
import type { HttpConnectionPolicy } from "../../src/http/connection.ts";
import { ProjectService } from "../../src/projects/service.ts";
import { ProjectStore } from "../../src/projects/store.ts";
import { ProviderService } from "../../src/providers/service.ts";
import { ProviderStore } from "../../src/providers/store.ts";
export async function fixture(
  directory: string,
  prepare?: (faux: ReturnType<typeof fauxProvider>) => void,
  vision = false,
  options: {
    connectionPolicy?: HttpConnectionPolicy;
    configure?: (app: ReturnType<typeof createApp>) => void;
  } = {},
) {
  const providerStore = new ProviderStore(join(directory, "providers.sqlite"));
  const models = createModels({
    credentials: providerStore,
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  const faux = fauxProvider({
    provider: "test",
    models: [
      { id: "test-model", input: ["text"] },
      {
        id: "reasoning-model",
        name: "Reasoning model",
        reasoning: true,
        input: vision ? ["text", "image"] : ["text"],
      },
    ],
  });
  models.setProvider({
    ...faux.provider,
    auth: {
      apiKey: {
        name: "test",
        resolve: async () => ({ auth: { apiKey: "fake-test-only" } }),
      },
    },
  });
  await providerStore.modify("test", async () => ({
    type: "api_key",
    key: "secret-not-in-responses",
  }));
  await providerStore.setFavorite("test", "test-model", true);
  await providerStore.setFavorite("test", "reasoning-model", true);
  const providers = new ProviderService(providerStore, models);
  const projects = new ProjectService(
    new ProjectStore(join(directory, "projects.sqlite")),
  );
  const service = new HarnessService(
    new HarnessStore(join(directory, "harnesses.sqlite")),
    join(directory, "sessions"),
    projects,
    providers,
  );
  const app = createApp(
    {},
    providers,
    projects,
    service,
    options.connectionPolicy,
  );
  options.configure?.(app);
  prepare?.(faux);
  await app.ready();
  return { app, service, projects, providers, faux };
}
