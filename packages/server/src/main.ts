import { dirname, join } from "node:path";
import { httpConfiguration } from "./access/configuration.ts";
import { AccessService } from "./access/service.ts";
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
const http = await httpConfiguration(
  join(dirname(projectDatabasePath()), "http.json"),
);
const access = http.authentication
  ? new AccessService(join(dirname(projectDatabasePath()), "access.sqlite"))
  : undefined;
const app = createApp(
  { logger: { redact: ["req.headers.authorization", "req.body.code"] } },
  providers,
  projects,
  harnesses,
  {
    origins: http.origins,
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    ...(access && { authorize: access.authorize }),
  },
);
if (access) {
  access.register(app);
  app.addHook("preClose", async () => access.close());
}
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
  await app.listen({ host: http.host, port: http.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  try {
    await app.close();
  } finally {
    releaseInstance();
  }
}
