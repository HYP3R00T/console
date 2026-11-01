import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { FastifyInstance } from "fastify";
import type { sessionService } from "./service.ts";

const name = { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" };
const requestId = {
  type: "string",
  minLength: 1,
  maxLength: 200,
  pattern: "\\S",
};
const params = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", format: "uuid" } },
};
const creation = {
  type: "object",
  additionalProperties: false,
  required: ["name", "requestId"],
  properties: { name, requestId },
};
const rename = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: { name },
};
type Id = { Params: { id: string } };

export function registerSessionRoutes(
  app: FastifyInstance,
  service: Awaited<ReturnType<typeof sessionService>>,
) {
  app.get("/projects", () => service.projects.list());
  app.post<{ Body: { name: string; path: string; requestId: string } }>(
    "/projects",
    {
      schema: {
        body: {
          ...creation,
          required: ["name", "path", "requestId"],
          properties: {
            ...creation.properties,
            path: { type: "string", minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (req, reply) =>
      reply.code(201).send(await service.projects.create(req.body)),
  );
  app.patch<Id & { Body: { name: string } }>(
    "/projects/:id",
    { schema: { params, body: rename } },
    (req) => service.projects.rename(req.params.id, req.body.name),
  );
  app.get<Id>("/projects/:id/sessions", { schema: { params } }, (req) =>
    service.list(req.params.id),
  );
  app.post<Id & { Body: { name: string; requestId: string } }>(
    "/projects/:id/sessions",
    { schema: { params, body: creation } },
    async (req, reply) =>
      reply.code(201).send(await service.create(req.params.id, req.body)),
  );
  app.get<Id>("/sessions/:id", { schema: { params } }, (req) =>
    service.get(req.params.id),
  );
  app.patch<Id & { Body: { name: string } }>(
    "/sessions/:id",
    { schema: { params, body: rename } },
    (req) => service.rename(req.params.id, req.body.name),
  );
  app.get<Id & { Querystring: { before?: string } }>(
    "/sessions/:id/history",
    {
      schema: {
        params,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            before: { type: "string", pattern: "^[1-9][0-9]{0,15}$" },
          },
        },
      },
    },
    (req) => service.history(req.params.id, req.query.before),
  );
  app.patch<
    Id & {
      Body: {
        model: string;
        thinkingLevel?: ModelThinkingLevel;
        instructions?: string;
      };
    }
  >(
    "/sessions/:id/config",
    {
      schema: {
        params,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["model"],
          properties: {
            model: { type: "string", minLength: 1, maxLength: 200 },
            thinkingLevel: { type: "string", maxLength: 24 },
            instructions: { type: "string", maxLength: 16000 },
          },
        },
      },
    },
    (req) => service.configure(req.params.id, req.body),
  );
  app.post<Id & { Body: { text: string; requestId: string } }>(
    "/sessions/:id/messages",
    {
      schema: {
        params,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["text", "requestId"],
          properties: {
            text: {
              type: "string",
              minLength: 1,
              maxLength: 32000,
              pattern: "\\S",
            },
            requestId,
          },
        },
      },
    },
    async (req, reply) =>
      reply.code(202).send(await service.submit(req.params.id, req.body)),
  );
  for (const action of ["cancel", "resume"] as const)
    app.post<Id>(
      `/sessions/:id/${action}`,
      { schema: { params } },
      async (req, reply) => {
        await service[action](req.params.id);
        return reply.code(204).send();
      },
    );
  app.delete<Id>(
    "/sessions/:id",
    { schema: { params } },
    async (req, reply) => {
      await service.remove(req.params.id);
      return reply.code(204).send();
    },
  );
}
