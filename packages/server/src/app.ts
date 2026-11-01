import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";

const webOrigins = ["http://127.0.0.1:3001", "http://localhost:3001"];

export function createApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin !== undefined && !webOrigins.includes(origin)) {
      return reply.code(403).send({ error: "Browser origin is not allowed" });
    }
  });
  app.register(cors, {
    origin: webOrigins,
    methods: ["GET"],
    allowedHeaders: [],
    credentials: false,
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/v1/connection", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return { product: "console", apiVersion: 1 };
  });
  return app;
}
