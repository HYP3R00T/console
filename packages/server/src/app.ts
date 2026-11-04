import Fastify, { type FastifyServerOptions } from "fastify";
import { registerHarnessRoutes } from "./harnesses/routes.ts";
import type { HarnessService } from "./harnesses/service.ts";
import {
  configureHttpConnection,
  type HttpConnectionPolicy,
  localConnectionPolicy,
} from "./http/connection.ts";
import { registerProjectRoutes } from "./projects/routes.ts";
import type { ProjectService } from "./projects/service.ts";
import { registerProviderRoutes } from "./providers/routes.ts";
import type { ProviderService } from "./providers/service.ts";

export function createApp(
  options: FastifyServerOptions = {},
  providers?: ProviderService,
  projects?: ProjectService,
  harnesses?: HarnessService,
  connectionPolicy: HttpConnectionPolicy = localConnectionPolicy,
) {
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false } },
    ...options,
  });
  configureHttpConnection(app, connectionPolicy);
  if (providers) {
    registerProviderRoutes(app, providers);
    app.addHook("onClose", () => providers.close());
  }
  if (projects) {
    registerProjectRoutes(app, projects);
    app.addHook("onClose", async () => projects.close());
  }
  if (harnesses) {
    registerHarnessRoutes(app, harnesses);
    app.addHook("onReady", () => harnesses.start());
    app.addHook("preClose", () => harnesses.close());
  }
  return app;
}
