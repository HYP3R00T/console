import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { FastifyInstance } from "fastify";
import type { SandboxPolicy } from "../sandbox/policy.ts";
import type { openSessions } from "./catalog.ts";
import { params, string } from "./schemas.ts";

type ConversationParams = { id: string; conversationId?: string };
export function registerConversationRoutes(
  app: FastifyInstance,
  sessions: Awaited<ReturnType<typeof openSessions>>,
) {
  const conversationFor = ({ id, conversationId }: ConversationParams) =>
    sessions.conversation(id, conversationId);
  for (const base of [
    "/sessions/:id",
    "/sessions/:id/conversations/:conversationId",
  ]) {
    app.patch<{
      Params: ConversationParams;
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
        await (await conversationFor(req.params)).selectExtension(
          req.body.name,
          req.body.enabled,
        );
        return (await conversationFor(req.params)).inspect();
      },
    );
    app.get<{ Params: { id: string; conversationId?: string } }>(
      `${base}/resources`,
      { schema: { params } },
      async (request) => (await conversationFor(request.params)).resources(),
    );
    app.get<{ Params: { id: string; conversationId?: string } }>(
      `${base}/inspect`,
      { schema: { params } },
      async (req) => (await conversationFor(req.params)).inspect(),
    );
    app.patch<{
      Params: ConversationParams;
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
        await (await conversationFor(req.params)).manage(req.body);
        return sessions.get(req.params.id, req.params.conversationId);
      },
    );
    app.post<{
      Params: ConversationParams;
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
            await (await conversationFor(req.params)).fork(
              req.body.entryId,
              req.body.requestId,
            ),
          ),
    );
    app.get<{
      Params: ConversationParams;
      Querystring: { before?: string };
    }>(
      `${base}/history`,
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
      async (request) =>
        (await conversationFor(request.params)).history(request.query.before),
    );
    app.get<{ Params: { id: string; conversationId?: string } }>(
      `${base}`,
      { schema: { params } },
      (request) =>
        sessions.get(request.params.id, request.params.conversationId),
    );
    app.patch<{
      Params: ConversationParams;
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
        await (await conversationFor(request.params)).configureSandbox(
          request.body,
        );
        return sessions.get(request.params.id, request.params.conversationId);
      },
    );
    app.patch<{
      Params: ConversationParams;
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
        await (await conversationFor(request.params)).configure(request.body);
        return sessions.get(request.params.id, request.params.conversationId);
      },
    );
    app.post<{
      Params: ConversationParams;
      Body: {
        text: string;
        requestId: string;
        whenBusy?: "reject" | "steer" | "followUp";
      };
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
              whenBusy: {
                type: "string",
                enum: ["reject", "steer", "followUp"],
              },
            },
          },
        },
      },
      async (request, reply) =>
        reply
          .code(202)
          .send(
            await (await conversationFor(request.params)).submit(request.body),
          ),
    );
    app.delete<{
      Params: { id: string; conversationId?: string; submissionId: string };
    }>(
      `${base}/submissions/:submissionId`,
      {
        schema: {
          params: {
            ...params,
            required: [...params.required, "submissionId"],
            properties: { ...params.properties, submissionId: string },
          },
        },
      },
      async (request, reply) => {
        await (await conversationFor(request.params)).withdraw(
          request.params.submissionId,
        );
        return reply.code(204).send();
      },
    );
    app.post<{
      Params: ConversationParams;
      Body: { requestId: string; instructions?: string };
    }>(
      `${base}/compact`,
      {
        schema: {
          params,
          body: {
            type: "object",
            required: ["requestId"],
            additionalProperties: false,
            properties: {
              requestId: string,
              instructions: { type: "string", maxLength: 8000 },
            },
          },
        },
      },
      async (request, reply) =>
        reply
          .code(202)
          .send(
            await (await conversationFor(request.params)).compact(request.body),
          ),
    );
    app.post<{
      Params: ConversationParams;
      Body: { requestId: string; handoff?: string };
    }>(
      `${base}/reset`,
      {
        schema: {
          params,
          body: {
            type: "object",
            required: ["requestId"],
            additionalProperties: false,
            properties: {
              requestId: string,
              handoff: { type: "string", maxLength: 8000 },
            },
          },
        },
      },
      async (request, reply) =>
        reply
          .code(202)
          .send(
            await (await conversationFor(request.params)).reset(request.body),
          ),
    );
    app.post<{ Params: { id: string; conversationId?: string } }>(
      `${base}/cancel`,
      { schema: { params } },
      async (request, reply) => {
        await (await conversationFor(request.params)).cancel();
        return reply.code(204).send();
      },
    );
    app.post<{ Params: { id: string; conversationId?: string } }>(
      `${base}/resume`,
      { schema: { params } },
      async (request, reply) => {
        await (await conversationFor(request.params)).resume();
        return reply.code(204).send();
      },
    );
  }
}
