import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { FastifyInstance } from "fastify";
import type { SandboxPolicy } from "./sandbox-policy.ts";
import type { openSessions } from "./sessions.ts";

export function registerSessionRoutes(
  app: FastifyInstance,
  sessions: Awaited<ReturnType<typeof openSessions>>,
) {
  const string = { type: "string", minLength: 1, maxLength: 200 };
  const params = {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: { id: string, conversationId: string },
  };
  app.get("/state", () => sessions.state.get());
  app.put<{ Body: { value: Record<string, unknown>; revision: number } }>(
    "/state",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["value", "revision"],
          properties: {
            value: { type: "object", additionalProperties: true },
            revision: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    (req) => sessions.state.save(req.body.value, req.body.revision),
  );
  app.delete<{ Params: { id: string } }>(
    "/sessions/:id/permanent",
    async (req, reply) => {
      await sessions.purge(req.params.id);
      return reply.code(204).send();
    },
  );
  app.delete<{ Params: { id: string; conversationId: string } }>(
    "/sessions/:id/conversations/:conversationId/permanent",
    async (req, reply) => {
      await sessions.purge(req.params.id, req.params.conversationId);
      return reply.code(204).send();
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/workspaces/:id/permanent",
    async (req, reply) => {
      sessions.purgeWorkspace(req.params.id);
      return reply.code(204).send();
    },
  );
  app.get("/sessions", () => sessions.list());
  app.get("/sessions/trash", () => sessions.list(true));
  app.delete<{ Params: { id: string } }>(
    "/sessions/:id",
    async (req, reply) => {
      await sessions.trash(req.params.id);
      return reply.code(204).send();
    },
  );
  app.post<{ Params: { id: string } }>("/sessions/:id/restore", async (req) => {
    sessions.restore(req.params.id);
    return sessions.get(req.params.id);
  });
  app.get<{ Params: { id: string } }>(
    "/sessions/:id/conversations/trash",
    (req) => sessions.deletedConversations(req.params.id),
  );
  app.delete<{ Params: { id: string; conversationId: string } }>(
    "/sessions/:id/conversations/:conversationId",
    async (req, reply) => {
      await sessions.trashConversation(
        req.params.id,
        req.params.conversationId,
      );
      return reply.code(204).send();
    },
  );
  app.post<{ Params: { id: string; conversationId: string } }>(
    "/sessions/:id/conversations/:conversationId/restore",
    async (req) => {
      await sessions.restoreConversation(
        req.params.id,
        req.params.conversationId,
      );
      return sessions.get(req.params.id, req.params.conversationId);
    },
  );
  app.post<{
    Body: {
      name?: string;
      requestId: string;
      workspaceId?: string;
      access?: "none" | "read" | "edit" | "setup";
    };
  }>(
    "/sessions",
    {
      schema: {
        body: {
          type: "object",
          required: ["requestId"],
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              pattern: "\\S",
            },
            requestId: string,
            workspaceId: string,
            access: { enum: ["none", "read", "edit", "setup"] },
          },
        },
      },
    },
    async (request, reply) => {
      const row = await sessions.create(
        request.body.name ?? "",
        request.body.requestId,
        request.body.workspaceId,
        request.body.access,
      );
      return reply.code(201).send(await sessions.get(row.id));
    },
  );
  const nameBody = {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" },
    },
  };
  app.patch<{
    Params: { id: string; conversationId?: string };
    Body: { name: string };
  }>("/sessions/:id", { schema: { params, body: nameBody } }, (req) => {
    sessions.rename(req.params.id, req.body.name.trim());
    return sessions.get(req.params.id);
  });
  app.get<{ Params: { id: string; conversationId?: string } }>(
    "/sessions/:id/conversations",
    { schema: { params } },
    (req) => sessions.conversations(req.params.id),
  );
  app.post<{
    Params: { id: string; conversationId?: string };
    Body: { name?: string; requestId: string };
  }>(
    "/sessions/:id/conversations",
    {
      schema: {
        params,
        body: {
          ...nameBody,
          required: ["requestId"],
          properties: { ...nameBody.properties, requestId: string },
        },
      },
    },
    async (req, reply) =>
      reply
        .code(201)
        .send(
          await sessions.createConversation(
            req.params.id,
            req.body.name?.trim() ?? "",
            req.body.requestId,
          ),
        ),
  );
  app.patch<{
    Params: { id: string; conversationId: string };
    Body: { name: string };
  }>(
    "/sessions/:id/conversations/:conversationId",
    { schema: { params, body: nameBody } },
    async (req) => {
      await sessions.renameConversation(
        req.params.id,
        req.params.conversationId,
        req.body.name.trim(),
      );
      return sessions.get(req.params.id, req.params.conversationId);
    },
  );
  for (const base of [
    "/sessions/:id",
    "/sessions/:id/conversations/:conversationId",
  ]) {
    app.patch<{
      Params: { id: string; conversationId?: string };
      Body: { name: string; enabled: boolean };
    }>(
      `${base}/extensions`,
      {
        schema: {
          params,
          body: {
            type: "object",
            required: ["name", "enabled"],
            additionalProperties: false,
            properties: { name: string, enabled: { type: "boolean" } },
          },
        },
      },
      async (req) => {
        await (
          await sessions.conversation(req.params.id, req.params.conversationId)
        ).selectExtension(req.body.name, req.body.enabled);
        return (
          await sessions.conversation(req.params.id, req.params.conversationId)
        ).inspect();
      },
    );
    app.get<{ Params: { id: string; conversationId?: string } }>(
      `${base}/inspect`,
      { schema: { params } },
      async (req) =>
        (
          await sessions.conversation(req.params.id, req.params.conversationId)
        ).inspect(),
    );
    app.patch<{
      Params: { id: string; conversationId?: string };
      Body: { tools: string[]; instructions?: string };
    }>(
      `${base}/agent`,
      {
        schema: {
          params,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["tools"],
            properties: {
              tools: {
                type: "array",
                maxItems: 100,
                uniqueItems: true,
                items: string,
              },
              instructions: { type: "string", maxLength: 16000 },
            },
          },
        },
      },
      async (req) => {
        await (
          await sessions.conversation(req.params.id, req.params.conversationId)
        ).manage(req.body);
        return sessions.get(req.params.id, req.params.conversationId);
      },
    );
    app.post<{
      Params: { id: string; conversationId?: string };
      Body: { entryId: string; requestId: string };
    }>(
      `${base}/fork`,
      {
        schema: {
          params,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["entryId", "requestId"],
            properties: { entryId: string, requestId: string },
          },
        },
      },
      async (req, reply) =>
        reply
          .code(201)
          .send(
            await (
              await sessions.conversation(
                req.params.id,
                req.params.conversationId,
              )
            ).fork(req.body.entryId, req.body.requestId),
          ),
    );
    app.get<{ Params: { id: string; conversationId?: string } }>(
      `${base}`,
      { schema: { params } },
      (request) =>
        sessions.get(request.params.id, request.params.conversationId),
    );
    app.patch<{
      Params: { id: string; conversationId?: string };
      Body: SandboxPolicy;
    }>(
      `${base}/sandbox`,
      {
        schema: {
          params,
          body: {
            type: "object",
            additionalProperties: false,
            required: [
              "enabled",
              "workspace",
              "readPaths",
              "writePaths",
              "network",
            ],
            properties: {
              enabled: { type: "boolean" },
              commands: { type: "boolean" },
              workspace: { type: "string", maxLength: 2000 },
              readPaths: {
                type: "array",
                maxItems: 20,
                items: { type: "string", minLength: 1, maxLength: 2000 },
              },
              writePaths: {
                type: "array",
                maxItems: 20,
                items: { type: "string", minLength: 1, maxLength: 2000 },
              },
              network: { enum: ["blocked", "unrestricted"] },
            },
          },
        },
      },
      async (request) => {
        await (
          await sessions.conversation(
            request.params.id,
            request.params.conversationId,
          )
        ).configureSandbox(request.body);
        return sessions.get(request.params.id, request.params.conversationId);
      },
    );
    app.patch<{
      Params: { id: string; conversationId?: string };
      Body: {
        provider: string;
        model: string;
        thinkingLevel?: ModelThinkingLevel;
      };
    }>(
      `${base}/config`,
      {
        schema: {
          params,
          body: {
            type: "object",
            required: ["provider", "model"],
            additionalProperties: false,
            properties: {
              provider: string,
              model: string,
              thinkingLevel: { type: "string", maxLength: 24 },
            },
          },
        },
      },
      async (request) => {
        await (
          await sessions.conversation(
            request.params.id,
            request.params.conversationId,
          )
        ).configure(request.body);
        return sessions.get(request.params.id, request.params.conversationId);
      },
    );
    app.post<{
      Params: { id: string; conversationId?: string };
      Body: { text: string; requestId: string };
    }>(
      `${base}/messages`,
      {
        schema: {
          params,
          body: {
            type: "object",
            required: ["text", "requestId"],
            additionalProperties: false,
            properties: {
              text: { type: "string", minLength: 1, maxLength: 32000 },
              requestId: string,
            },
          },
        },
      },
      async (request, reply) =>
        reply
          .code(202)
          .send(
            await (
              await sessions.conversation(
                request.params.id,
                request.params.conversationId,
              )
            ).submit(request.body),
          ),
    );
    app.post<{ Params: { id: string; conversationId?: string } }>(
      `${base}/cancel`,
      { schema: { params } },
      async (request, reply) => {
        await (
          await sessions.conversation(
            request.params.id,
            request.params.conversationId,
          )
        ).cancel();
        return reply.code(204).send();
      },
    );
    app.post<{ Params: { id: string; conversationId?: string } }>(
      `${base}/resume`,
      { schema: { params } },
      async (request, reply) => {
        await (
          await sessions.conversation(
            request.params.id,
            request.params.conversationId,
          )
        ).resume();
        return reply.code(204).send();
      },
    );
  }
}
