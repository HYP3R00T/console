import { createApp } from "./app.ts";
import { ProjectService } from "./projects/service.ts";
import { ProjectStore, projectDatabasePath } from "./projects/store.ts";

import { ProviderService } from "./providers/service.ts";
import { ProviderStore, providerDatabasePath } from "./providers/store.ts";

const providers = new ProviderService(
  new ProviderStore(providerDatabasePath()),
);
const projects = new ProjectService(new ProjectStore(projectDatabasePath()));
const app = createApp({ logger: true }, providers, projects);
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    void app.close().catch((error: unknown) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: "127.0.0.1", port: 3000 });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
