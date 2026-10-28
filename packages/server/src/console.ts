import { homedir } from "node:os";
import { join } from "node:path";
import type { CredentialStore, Models } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { FastifyInstance } from "fastify";
import { openCredentials } from "./credentials.ts";
import { createProviders } from "./providers.ts";
import { registerSessionRoutes } from "./session-routes.ts";
import { openSessions } from "./sessions.ts";

export type ConsoleOptions = {
  dataDirectory?: string;
  models?: (store: CredentialStore) => Models;
};

export async function registerConsole(
  app: FastifyInstance,
  options: ConsoleOptions,
) {
  const directory =
    options.dataDirectory ??
    process.env.CONSOLE_DATA_DIR ??
    join(
      process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"),
      "console",
    );
  const credentials = await openCredentials(directory);
  const models =
    options.models?.(credentials.store) ??
    builtinModels({ credentials: credentials.store });
  const providers = createProviders(models, credentials.deviceId);
  let sessions: Awaited<ReturnType<typeof openSessions>>;
  try {
    sessions = await openSessions(models, directory);
  } catch (error) {
    await credentials.close();
    throw error;
  }
  app.addHook("onClose", async () => {
    await providers.close();
    try {
      await sessions.close();
    } finally {
      await credentials.close();
    }
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const host = new URL(`http://${request.headers.host ?? "invalid"}`)
      .hostname;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host))
      return reply
        .code(403)
        .send({ message: "Console currently supports loopback access only." });
    // A custom header forces cross-origin browsers to preflight; no CORS is enabled.
    if (
      !["GET", "HEAD"].includes(request.method) &&
      request.headers["x-console-request"] !== "1"
    ) {
      return reply
        .code(403)
        .send({ message: "Use the Console client to change configuration." });
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    const status =
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    // Provider exceptions can contain token responses; never log or return their raw payloads.
    reply.code(status).send({
      message:
        status < 500 && error instanceof Error
          ? error.message
          : "Console operation failed. Check local storage and provider configuration.",
    });
  });
  const params = {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", maxLength: 200 } },
    additionalProperties: false,
  };
  const string = { type: "string", minLength: 1, maxLength: 200 };
  app.get("/providers", () => providers.list());
  app.post<{ Params: { id: string } }>(
    "/providers/:id/refresh",
    { schema: { params } },
    async (request, reply) => {
      await providers.refresh(request.params.id);
      return reply.code(204).send();
    },
  );
  app.get("/connections/current", () => providers.current());
  app.post<{ Body: { provider: string; method: "api_key" | "oauth" } }>(
    "/connections",
    {
      schema: {
        body: {
          type: "object",
          required: ["provider", "method"],
          additionalProperties: false,
          properties: {
            provider: string,
            method: { enum: ["api_key", "oauth"] },
          },
        },
      },
    },
    async (request, reply) =>
      reply
        .code(202)
        .send(providers.start(request.body.provider, request.body.method)),
  );
  app.get<{ Params: { id: string } }>(
    "/connections/:id",
    { schema: { params } },
    (request) => providers.get(request.params.id),
  );
  app.post<{
    Params: { id: string };
    Body: { promptId: string; value: string };
  }>(
    "/connections/:id/answer",
    {
      schema: {
        params,
        body: {
          type: "object",
          required: ["promptId", "value"],
          additionalProperties: false,
          properties: {
            promptId: string,
            value: { type: "string", maxLength: 16000 },
          },
        },
      },
    },
    async (request, reply) => {
      providers.answer(
        request.params.id,
        request.body.promptId,
        request.body.value,
      );
      return reply.code(204).send();
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/connections/:id",
    { schema: { params } },
    async (request, reply) => {
      providers.get(request.params.id);
      await providers.close();
      return reply.code(204).send();
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/providers/:id",
    { schema: { params } },
    async (request, reply) => {
      await providers.disconnect(request.params.id);
      return reply.code(204).send();
    },
  );
  registerSessionRoutes(app, sessions);
}
