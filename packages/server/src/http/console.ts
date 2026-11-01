import { timingSafeEqual } from "node:crypto";
import type { CredentialStore, Models } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { FastifyInstance } from "fastify";
import { openCredentials } from "../models/credentials.ts";
import { createProviders } from "../models/providers.ts";
import { resolveConfiguration } from "../platform/configuration.ts";
import { registerSessionRoutes } from "../sessions/routes.ts";
import { sessionService } from "../sessions/service.ts";

export type ConsoleOptions = {
  dataDirectory?: string;
  accessToken?: string;
  models?: (store: CredentialStore) => Models;
  providerId?: string;
};

export async function registerConsole(
  app: FastifyInstance,
  options: ConsoleOptions,
) {
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = options.accessToken;
    if (token) {
      const actual = Buffer.from(request.headers.authorization ?? "");
      const expected = Buffer.from(`Bearer ${token}`);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        return reply
          .code(401)
          .send({ message: "Backend authorization required." });
    } else {
      let host = "";
      try {
        host = new URL(`http://${request.headers.host ?? "invalid"}`).hostname;
      } catch {
        /* Invalid Host is denied. */
      }
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(host) ||
        !["127.0.0.1", "::1"].includes(request.ip.replace(/^::ffff:/, ""))
      )
        return reply.code(403).send({
          message:
            "Only loopback clients are supported without an access token.",
        });
    }
    if (
      !["GET", "HEAD"].includes(request.method) &&
      request.headers["x-console-request"] !== "1"
    )
      return reply
        .code(403)
        .send({ message: "Mutations require X-Console-Request: 1." });
  });
  app.setErrorHandler((error, request, reply) => {
    const status =
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    if (status >= 500)
      app.log.error(
        { requestId: request.id, category: "operation_failed", status },
        "Console operation failed",
      );
    // Never serialize/log arbitrary provider exception payloads.
    return reply.code(status).send({
      message:
        status < 500 && error instanceof Error
          ? error.message
          : "Operation failed. Check server diagnostics and provider configuration.",
    });
  });
  const { directory } = resolveConfiguration(options);
  const credentials = await openCredentials(directory);
  let service: Awaited<ReturnType<typeof sessionService>>;
  const models =
    options.models?.(credentials.store) ??
    builtinModels({ credentials: credentials.store });
  const providerId = options.providerId ?? "openai-codex";
  const providers = createProviders(models, credentials.deviceId, providerId);
  try {
    if (!models.getProvider(providerId))
      throw new Error("Configured provider is unavailable.");
    service = await sessionService(models, providerId, directory, (event) =>
      app.log.warn(event, "Runtime diagnostic"),
    );
  } catch (error) {
    await credentials.close();
    throw error;
  }
  app.addHook("onClose", async () => {
    try {
      await providers.close();
    } finally {
      try {
        await service.close();
      } finally {
        await credentials.close();
      }
    }
  });
  app.get("/info", () => ({
    product: "console",
    apiVersion: 1,
    provider: providerId,
    execution: "host",
    storage: directory,
  }));
  app.get("/provider", async () => (await providers.list())[0]);
  app.get("/provider/login", () => providers.current());
  app.post<{ Body: { method: "oauth" | "api_key" } }>(
    "/provider/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["method"],
          additionalProperties: false,
          properties: { method: { enum: ["oauth", "api_key"] } },
        },
      },
    },
    (req, reply) =>
      reply.code(202).send(providers.start(providerId, req.body.method)),
  );
  app.post<{ Body: { loginId: string; promptId: string; value: string } }>(
    "/provider/login/answer",
    {
      schema: {
        body: {
          type: "object",
          required: ["loginId", "promptId", "value"],
          additionalProperties: false,
          properties: {
            loginId: { type: "string", maxLength: 200 },
            promptId: { type: "string", maxLength: 200 },
            value: { type: "string", maxLength: 16000 },
          },
        },
      },
    },
    (req, reply) => {
      providers.answer(req.body.loginId, req.body.promptId, req.body.value);
      return reply.code(204).send();
    },
  );
  app.delete("/provider/login", async (_req, reply) => {
    await providers.close();
    return reply.code(204).send();
  });
  app.delete("/provider/credentials", async (_req, reply) => {
    await providers.disconnect(providerId);
    return reply.code(204).send();
  });
  registerSessionRoutes(app, service);
}
