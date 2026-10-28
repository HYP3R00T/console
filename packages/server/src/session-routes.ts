import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { FastifyInstance } from "fastify";
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
    properties: { id: string },
  };
  app.get("/sessions", () => sessions.list());
  app.post<{ Body: { name: string; requestId: string } }>(
    "/sessions",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "requestId"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            requestId: string,
          },
        },
      },
    },
    async (request, reply) => {
      const row = await sessions.create(
        request.body.name,
        request.body.requestId,
      );
      return reply.code(201).send(await sessions.get(row.id));
    },
  );
  app.get<{ Params: { id: string } }>(
    "/sessions/:id",
    { schema: { params } },
    (request) => sessions.get(request.params.id),
  );
  app.patch<{
    Params: { id: string };
    Body: {
      provider: string;
      model: string;
      thinkingLevel?: ModelThinkingLevel;
    };
  }>(
    "/sessions/:id/config",
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
      await (await sessions.conversation(request.params.id)).configure(
        request.body,
      );
      return sessions.get(request.params.id);
    },
  );
  app.post<{
    Params: { id: string };
    Body: { text: string; requestId: string };
  }>(
    "/sessions/:id/messages",
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
          await (await sessions.conversation(request.params.id)).submit(
            request.body,
          ),
        ),
  );
  app.post<{ Params: { id: string } }>(
    "/sessions/:id/cancel",
    { schema: { params } },
    async (request, reply) => {
      await (await sessions.conversation(request.params.id)).cancel();
      return reply.code(204).send();
    },
  );
  app.post<{ Params: { id: string } }>(
    "/sessions/:id/resume",
    { schema: { params } },
    async (request, reply) => {
      await (await sessions.conversation(request.params.id)).resume();
      return reply.code(204).send();
    },
  );
}
