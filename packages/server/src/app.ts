import Fastify, { type FastifyServerOptions } from "fastify";

export function createApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}
