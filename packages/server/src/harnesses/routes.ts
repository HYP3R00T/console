import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  type ConversationWatch,
  type Cursor,
  type DocumentWatch,
  StorageRequestError,
} from "@earendil-works/pi-durable";
import type { FastifyInstance } from "fastify";
import { ProjectError } from "../projects/service.ts";
import { ConversationInfo } from "./documents.ts";
import { HarnessError, type HarnessService } from "./service.ts";
import { conversationView, messages, submissionView } from "./view.ts";

const uuid = { type: "string", format: "uuid" };
const recordId = { type: "string", pattern: "^(0|[1-9][0-9]{0,14})$" };
const model = {
  type: "object",
  required: ["provider", "modelId"],
  additionalProperties: false,
  properties: {
    provider: { type: "string", minLength: 1, maxLength: 200 },
    modelId: { type: "string", minLength: 1, maxLength: 300 },
  },
};
const creation = {
  type: "object",
  additionalProperties: false,
  properties: {},
};
type Scope = { sessionId: string; conversationId: string };
const params = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const conversationParams = params({
  sessionId: uuid,
  conversationId: recordId,
});
const base = "/v1/sessions/:sessionId/conversations/:conversationId";
export function registerHarnessRoutes(
  app: FastifyInstance,
  service: HarnessService,
) {
  let streams = 0;
  app.register(async (routes) => {
    routes.addHook("onSend", async (_req, reply, payload) => {
      reply.header("Cache-Control", "no-store");
      return payload;
    });
    routes.setErrorHandler((error, _req, reply) => {
      const known =
        error instanceof HarnessError || error instanceof ProjectError;
      const invalid =
        error instanceof StorageRequestError ||
        (typeof error === "object" && error !== null && "validation" in error);
      reply.code(known ? error.statusCode : invalid ? 400 : 500).send({
        error: known
          ? error.message
          : invalid
            ? "Invalid session request."
            : "Session operation failed.",
      });
    });
    routes.get<{ Params: { id: string } }>(
      "/v1/projects/:id/sessions",
      { schema: { params: params({ id: uuid }) } },
      (req) => service.operation(() => service.list(req.params.id)),
    );
    routes.post<{ Params: { id: string }; Body: Record<string, never> }>(
      "/v1/projects/:id/sessions",
      { schema: { params: params({ id: uuid }), body: creation } },
      async (req, reply) =>
        reply
          .code(201)
          .send(await service.operation(() => service.create(req.params.id))),
    );
    routes.get("/v1/standalone", () =>
      service.operation(() => service.listStandalone()),
    );
    routes.post<{ Body: Record<string, never> }>(
      "/v1/standalone",
      { schema: { body: creation } },
      async (_req, reply) =>
        reply
          .code(201)
          .send(await service.operation(() => service.createStandalone())),
    );
    routes.get<{ Params: { sessionId: string } }>(
      "/v1/standalone/:sessionId",
      { schema: { params: params({ sessionId: uuid }) } },
      (req) =>
        service.operation(() => service.standalone(req.params.sessionId)),
    );
    routes.get<{ Params: { sessionId: string } }>(
      "/v1/sessions/:sessionId/conversations",
      { schema: { params: params({ sessionId: uuid }) } },
      (req) =>
        service.operation(() => service.conversations(req.params.sessionId)),
    );
    routes.post<{ Params: { sessionId: string }; Body: Record<string, never> }>(
      "/v1/sessions/:sessionId/conversations",
      { schema: { params: params({ sessionId: uuid }), body: creation } },
      async (req, reply) =>
        reply
          .code(201)
          .send(
            await service.operation(() =>
              service.addConversation(req.params.sessionId),
            ),
          ),
    );
    routes.put<{ Params: Scope; Body: { name: string } }>(
      base,
      {
        schema: {
          params: conversationParams,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["name"],
            properties: {
              name: {
                type: "string",
                minLength: 1,
                maxLength: 120,
                pattern: "\\S",
              },
            },
          },
        },
      },
      (req) =>
        service.operation(() =>
          service.renameConversation(
            req.params.sessionId,
            req.params.conversationId,
            req.body.name,
          ),
        ),
    );
    routes.post<{
      Params: Scope;
      Body: {
        content: string;
        requestId: string;
        model?: { provider: string; modelId: string };
        thinkingLevel?: string;
      };
    }>(
      `${base}/messages`,
      {
        schema: {
          params: conversationParams,
          body: {
            type: "object",
            required: ["content", "requestId"],
            additionalProperties: false,
            properties: {
              content: {
                type: "string",
                minLength: 1,
                maxLength: 32000,
                pattern: "\\S",
              },
              requestId: uuid,
              model,
              thinkingLevel: { type: "string", maxLength: 40 },
            },
          },
        },
      },
      async (req, reply) =>
        reply.code(202).send(
          submissionView(
            await service.operation(() =>
              service.submit(
                req.params.sessionId,
                req.params.conversationId,
                req.body.content,
                req.body.requestId,
                {
                  model: req.body.model,
                  thinkingLevel: req.body.thinkingLevel,
                },
              ),
            ),
          ),
        ),
    );
    routes.get<{ Params: Scope & { submissionId: string } }>(
      `${base}/submissions/:submissionId`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            submissionId: recordId,
          }),
        },
      },
      async (req) =>
        submissionView(
          await service.operation(() =>
            service.submission(
              req.params.sessionId,
              req.params.conversationId,
              req.params.submissionId,
            ),
          ),
        ),
    );
    routes.get<{ Params: Scope }>(
      `${base}/submissions`,
      { schema: { params: conversationParams } },
      (req) =>
        service.operation(async () => {
          const latest = await service.latestSubmission(
            req.params.sessionId,
            req.params.conversationId,
          );
          return { latest: latest ? submissionView(latest) : null };
        }),
    );
    routes.post<{ Params: { sessionId: string } }>(
      "/v1/sessions/:sessionId/stop",
      {
        schema: {
          params: params({ sessionId: uuid }),
          body: { type: "object", additionalProperties: false },
        },
      },
      (req) => service.operation(() => service.stop(req.params.sessionId)),
    );
    routes.get<{ Params: Scope; Querystring: { cursor?: string } }>(
      `${base}/history`,
      {
        schema: {
          params: conversationParams,
          querystring: {
            type: "object",
            additionalProperties: false,
            properties: { cursor: { type: "string", maxLength: 4096 } },
          },
        },
      },
      (req) =>
        service.operation(async () => {
          let cursor: Cursor | undefined;
          if (req.query.cursor) {
            try {
              const value = JSON.parse(
                Buffer.from(req.query.cursor, "base64url").toString(),
              );
              if (!value || typeof value !== "object" || Array.isArray(value))
                throw new Error();
              cursor = value;
            } catch {
              throw new HarnessError(400, "Invalid history cursor.");
            }
          }
          const page = await service.history(
            req.params.sessionId,
            req.params.conversationId,
            cursor,
          );
          return {
            messages: messages(page.items).reverse(),
            ...(page.next
              ? {
                  next: Buffer.from(JSON.stringify(page.next)).toString(
                    "base64url",
                  ),
                }
              : {}),
          };
        }),
    );
    routes.get<{ Params: Scope }>(
      `${base}/events`,
      { schema: { params: conversationParams } },
      async (req, reply) => {
        if (streams >= 32)
          throw new HarnessError(503, "Too many conversation streams.");
        ++streams;
        let watch: ConversationWatch | undefined;
        let metadata:
          | DocumentWatch<{
              name: string;
              createdAt: string;
              lastSubmissionId?: number;
            }>
          | undefined;
        try {
          const scope = await service.operation(() =>
            service.conversation(
              req.params.sessionId,
              req.params.conversationId,
            ),
          );
          watch = await scope.conversation.watch(context);
          metadata = await scope.harness.watchDoc(
            ConversationInfo,
            scope.conversation.id,
            context,
          );
          if (reply.raw.destroyed || reply.raw.writableEnded) return;
          reply.hijack();
          for (const [key, value] of Object.entries(reply.getHeaders())) {
            if (value !== undefined) reply.raw.setHeader(key, value);
          }
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          });
          const write = async (data: string) => {
            if (reply.raw.destroyed || reply.raw.writableEnded) return;
            // Disconnect slow consumers; reconnection starts with a fresh complete snapshot.
            if (Buffer.byteLength(data) > 2 * 1024 * 1024) {
              reply.raw.destroy();
              return;
            }
            if (!reply.raw.write(data))
              await new Promise<void>((resolve) => {
                const finish = () => {
                  clearTimeout(timeout);
                  reply.raw.off("drain", finish);
                  reply.raw.off("close", finish);
                  resolve();
                };
                const timeout = setTimeout(() => {
                  reply.raw.destroy();
                  finish();
                }, 5000);
                reply.raw.once("drain", finish);
                reply.raw.once("close", finish);
              });
          };
          const send = (value: Parameters<typeof conversationView>[0]) =>
            write(
              `event: snapshot\ndata: ${JSON.stringify(conversationView(value))}\n\n`,
            );
          const stop = () => {
            void watch?.stop();
            void metadata?.stop();
          };
          reply.raw.once("close", stop);
          const timer = setInterval(() => {
            if (!reply.raw.writableNeedDrain) void write(": heartbeat\n\n");
          }, 15000);
          timer.unref();
          try {
            await send(watch.value);
            watch.start(async (value) => {
              await send(value);
            });
            metadata?.start(async () => {
              if (watch) await send(watch.value);
            });
            await watch.closed;
          } finally {
            clearInterval(timer);
            reply.raw.off("close", stop);
            reply.raw.end();
          }
        } finally {
          --streams;
          await watch?.stop();
          await metadata?.stop();
        }
      },
    );
  });
}
