import { timingSafeEqual } from "node:crypto";
import { arch, platform } from "node:os";
import { join } from "node:path";
import type { CredentialStore, Models } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { FastifyInstance } from "fastify";
import { registerBackends } from "./backends.ts";
import { resolveConfiguration } from "./configuration.ts";
import { openCredentials } from "./credentials.ts";
import {
  openMachineSettings,
  registerMachineSettings,
} from "./machine-settings.ts";
import { createProviders } from "./providers.ts";
import { sandboxSupport } from "./sandbox-runner.ts";
import { registerSessionRoutes } from "./session-routes.ts";
import { openSessions } from "./sessions.ts";
import { registerWorkspaces } from "./workspaces.ts";

export type ConsoleOptions = {
  dataDirectory?: string;
  machineName?: string;
  accessToken?: string;
  models?: (store: CredentialStore) => Models;
};

export async function registerConsole(
  app: FastifyInstance,
  options: ConsoleOptions,
) {
  const configuration = resolveConfiguration(options);
  const { directory } = configuration;
  const credentials = await openCredentials(directory);
  const models =
    options.models?.(credentials.store) ??
    builtinModels({ credentials: credentials.store });
  const machine = openMachineSettings(directory, configuration.machineName);
  const providers = createProviders(models, credentials.deviceId);
  let sessions: Awaited<ReturnType<typeof openSessions>>;
  try {
    sessions = await openSessions(models, directory, machine);
  } catch (error) {
    machine.close();
    await credentials.close();
    throw error;
  }
  app.addHook("onClose", async () => {
    await providers.close();
    try {
      await sessions.close();
    } finally {
      machine.close();
      await credentials.close();
    }
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = options.accessToken ?? process.env.CONSOLE_ACCESS_TOKEN;
    if (token) {
      const supplied = Buffer.from(request.headers.authorization ?? "");
      const expected = Buffer.from(`Bearer ${token}`);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        return reply
          .code(401)
          .send({ message: "Backend authorization required." });
    } else {
      const host = new URL(`http://${request.headers.host ?? "invalid"}`)
        .hostname;
      const address = request.ip.replace(/^::ffff:/, "");
      if (
        !["127.0.0.1", "localhost", "[::1]"].includes(host) ||
        !["127.0.0.1", "::1"].includes(address)
      )
        return reply
          .code(403)
          .send({ message: "Remote access requires CONSOLE_ACCESS_TOKEN." });
    }
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
  app.get<{ Querystring: { connected?: boolean } }>(
    "/providers",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { connected: { type: "boolean" } },
        },
      },
    },
    (request) => providers.list(request.query.connected),
  );
  app.get("/machines", async () => {
    const items = await sessions.list();
    return [
      {
        id: credentials.deviceId,
        name: machine.get().name,
        local: true,
        platform: platform(),
        architecture: arch(),
        status: "online",
        sessions: items.length,
        activeSessions: items.filter(
          (item) => item.status !== "idle" && item.status !== "unavailable",
        ).length,
        unavailableSessions: items.filter(
          (item) => item.status === "unavailable",
        ).length,
        storage: {
          directory,
          source: configuration.storageSource,
          credentials: join(directory, "credentials.sqlite"),
          catalog: join(directory, "catalog.sqlite"),
          sessions: join(directory, "sessions"),
          restartRequired: true,
        },
        capabilities: {
          remoteMachines: true,
          shell: true,
          sandboxedFiles: true,
        },
      },
    ];
  });
  app.get("/sandbox/support", () => sandboxSupport());
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
  await registerBackends(app, directory, () => machine.get().name);
  registerMachineSettings(app, machine, models, directory);
  registerWorkspaces(app, sessions.workspaces, (id) =>
    sessions.trashWorkspace(id),
  );
  registerSessionRoutes(app, sessions);
}
