import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export type HttpConnectionPolicy = {
  origins: string[];
  allowedHeaders: string[];
  credentials: boolean;
  /** Runs before feature handlers. A supplied policy can authenticate and reject requests. */
  authorize?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
};

export const localConnectionPolicy: HttpConnectionPolicy = {
  origins: ["http://127.0.0.1:3001", "http://localhost:3001"],
  allowedHeaders: ["Content-Type"],
  credentials: false,
};

export function configureHttpConnection(
  app: FastifyInstance,
  policy: HttpConnectionPolicy,
  backendId: string = randomUUID(),
) {
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin !== undefined && !policy.origins.includes(origin))
      return reply.code(403).send({ error: "Browser origin is not allowed" });
  });
  app.register(cors, {
    origin: policy.origins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: policy.allowedHeaders,
    credentials: policy.credentials,
  });
  if (policy.authorize) app.addHook("preHandler", policy.authorize);
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/v1/connection", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return { product: "console", apiVersion: 1, backendId };
  });
}
