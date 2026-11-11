import Fastify, { type FastifyServerOptions } from "fastify";
import { registerHarnessRoutes } from "./harnesses/routes.ts";
import type { HarnessService } from "./harnesses/service.ts";
import { registerCommandCatalog } from "./http/commands.ts";
import {
  configureHttpConnection,
  type HttpConnectionPolicy,
  localConnectionPolicy,
} from "./http/connection.ts";
import { registerProjectRoutes } from "./projects/routes.ts";
import type { ProjectService } from "./projects/service.ts";
import { registerProviderRoutes } from "./providers/routes.ts";
import type { ProviderService } from "./providers/service.ts";
import { registerWorkflowRoutes } from "./workflows/routes.ts";
import { WorkflowService } from "./workflows/service.ts";

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
  configureHttpConnection(
    app,
    connectionPolicy,
    providers?.store.installationId(),
  );
  registerCommandCatalog(app);
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
    if (projects) {
      const workflows = new WorkflowService(harnesses, projects);
      registerWorkflowRoutes(app, workflows);
      app.addHook("onReady", async () => workflows.startScheduler());
      app.addHook("preClose", () => workflows.close());
    }
    app.addHook("preClose", () => harnesses.close());
  }
  return app;
}
