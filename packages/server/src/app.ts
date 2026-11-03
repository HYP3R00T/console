import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import { registerHarnessRoutes } from "./harnesses/routes.ts";
import type { HarnessService } from "./harnesses/service.ts";
import { registerProjectRoutes } from "./projects/routes.ts";
import type { ProjectService } from "./projects/service.ts";
import { registerProviderRoutes } from "./providers/routes.ts";
import type { ProviderService } from "./providers/service.ts";

const webOrigins = ["http://127.0.0.1:3001", "http://localhost:3001"];

export function createApp(
  options: FastifyServerOptions = {},
  providers?: ProviderService,
  projects?: ProjectService,
  harnesses?: HarnessService,
) {
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false } },
    ...options,
  });
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin !== undefined && !webOrigins.includes(origin)) {
      return reply.code(403).send({ error: "Browser origin is not allowed" });
    }
  });
  app.register(cors, {
    origin: webOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/v1/connection", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return { product: "console", apiVersion: 1 };
  });
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
