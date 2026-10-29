import type { FastifyInstance } from "fastify";
import type { openSessions } from "./catalog.ts";
import { registerConversationRoutes } from "./conversation-routes.ts";
import { nameBody, params, string } from "./schemas.ts";

export function registerSessionRoutes(
  app: FastifyInstance,
  sessions: Awaited<ReturnType<typeof openSessions>>,
) {
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
      access?: "none" | "read" | "edit" | "project" | "setup";
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
            name: nameBody.properties.name,
            requestId: string,
            workspaceId: string,
            access: { enum: ["none", "read", "edit", "project", "setup"] },
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
  registerConversationRoutes(app, sessions);
}
