import { dirname, join } from "node:path";
import { createApp } from "./app.ts";
import { HarnessService } from "./harnesses/service.ts";
import { HarnessStore, harnessDataPath } from "./harnesses/store.ts";
import { ProjectService } from "./projects/service.ts";
import { ProjectStore, projectDatabasePath } from "./projects/store.ts";

import { ProviderService } from "./providers/service.ts";
import { ProviderStore, providerDatabasePath } from "./providers/store.ts";
import { claimInstance } from "./storage/instance-lock.ts";

const releaseInstance = claimInstance(dirname(projectDatabasePath()));
const providers = new ProviderService(
  new ProviderStore(providerDatabasePath()),
);
const projects = new ProjectService(new ProjectStore(projectDatabasePath()));
const harnesses = new HarnessService(
  new HarnessStore(join(dirname(projectDatabasePath()), "harnesses.sqlite")),
  harnessDataPath(),
  projects,
  providers,
);
const app = createApp({ logger: true }, providers, projects, harnesses);
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    void app
      .close()
      .finally(releaseInstance)
      .catch((error: unknown) => {
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
  try {
    await app.close();
  } finally {
    releaseInstance();
  }
}
