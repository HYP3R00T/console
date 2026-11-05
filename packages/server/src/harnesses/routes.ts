import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  type ConversationWatch,
  type Cursor,
  type DocumentWatch,
  StorageRequestError,
} from "@earendil-works/pi-durable";
import type { FastifyInstance } from "fastify";
import { ProjectError } from "../projects/service.ts";
import { AttachmentError, type AttachmentInput } from "./attachments.ts";
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
const retryableCreation = { ...creation, properties: { creationId: uuid } };
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
        error instanceof HarnessError ||
        error instanceof ProjectError ||
        error instanceof AttachmentError;
      const invalid =
        error instanceof StorageRequestError ||
        (typeof error === "object" && error !== null && "validation" in error);
      const tooLarge =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "FST_ERR_CTP_BODY_TOO_LARGE";
      reply
        .code(known ? error.statusCode : tooLarge ? 413 : invalid ? 400 : 500)
        .send({
          error: known
            ? error.message
            : tooLarge
              ? "Message and attachments exceed the upload limit."
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
    routes.post<{ Body: { creationId?: string } }>(
      "/v1/standalone",
      { schema: { body: retryableCreation } },
      async (req, reply) =>
        reply
          .code(201)
          .send(
            await service.operation(() =>
              service.createStandalone(req.body.creationId),
            ),
          ),
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
    routes.post<{
      Params: { sessionId: string };
      Body: { creationId?: string };
    }>(
      "/v1/sessions/:sessionId/conversations",
      {
        schema: {
          params: params({ sessionId: uuid }),
          body: retryableCreation,
        },
      },
      async (req, reply) =>
        reply
          .code(201)
          .send(
            await service.operation(() =>
              service.addConversation(
                req.params.sessionId,
                req.body.creationId,
              ),
            ),
          ),
    );
    routes.get<{ Params: Scope }>(
      `${base}/configuration`,
      { schema: { params: conversationParams } },
      (req) =>
        service.operation(() =>
          service.configuration(
            req.params.sessionId,
            req.params.conversationId,
          ),
        ),
    );
    routes.patch<{
      Params: Scope;
      Body: {
        revision: string;
        tools?: string[] | null;
        instructions?: string | null;
      };
    }>(
      `${base}/configuration`,
      {
        schema: {
          params: conversationParams,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["revision"],
            properties: {
              revision: { type: "string", pattern: "^[a-f0-9]{64}$" },
              tools: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "array",
                    maxItems: 100,
                    uniqueItems: true,
                    items: { type: "string", maxLength: 120 },
                  },
                ],
              },
              instructions: {
                anyOf: [{ type: "null" }, { type: "string", maxLength: 16000 }],
              },
            },
          },
        },
      },
      (req) =>
        service.operation(() =>
          service.configureConversation(
            req.params.sessionId,
            req.params.conversationId,
            req.body,
          ),
        ),
    );
    routes.get("/v1/archives/conversations", () =>
      service.operation(() => service.archivedConversations()),
    );
    routes.post<{ Params: Scope; Body: { stop?: boolean } }>(
      `${base}/archive`,
      {
        schema: {
          params: conversationParams,
          body: {
            type: "object",
            additionalProperties: false,
            properties: { stop: { type: "boolean" } },
          },
        },
      },
      (req) =>
        service.operation(() =>
          service.archiveConversation(
            req.params.sessionId,
            req.params.conversationId,
            !!req.body.stop,
          ),
        ),
    );
    routes.post<{ Params: Scope }>(
      `${base}/restore`,
      { schema: { params: conversationParams, body: creation } },
      (req) =>
        service.operation(() =>
          service.restoreConversation(
            req.params.sessionId,
            req.params.conversationId,
          ),
        ),
    );
    routes.delete<{ Params: Scope }>(
      `${base}/archive`,
      { schema: { params: conversationParams } },
      (req) =>
        service.operation(() =>
          service.deleteArchivedConversation(
            req.params.sessionId,
            req.params.conversationId,
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
        whenBusy?: "steer" | "followUp";
        attachments?: AttachmentInput[];
      };
    }>(
      `${base}/messages`,
      {
        bodyLimit: 3 * 1024 * 1024,
        schema: {
          params: conversationParams,
          body: {
            type: "object",
            required: ["content", "requestId"],
            additionalProperties: false,
            properties: {
              content: {
                type: "string",
                maxLength: 32000,
              },
              requestId: uuid,
              model,
              thinkingLevel: { type: "string", maxLength: 40 },
              whenBusy: { enum: ["steer", "followUp"] },
              attachments: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "object",
                  required: ["name", "mimeType", "data"],
                  additionalProperties: false,
                  properties: {
                    name: { type: "string", minLength: 1, maxLength: 200 },
                    mimeType: {
                      enum: [
                        "text/plain",
                        "image/png",
                        "image/jpeg",
                        "image/webp",
                      ],
                    },
                    data: { type: "string", minLength: 1, maxLength: 2796204 },
                  },
                },
              },
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
                  whenBusy: req.body.whenBusy,
                  attachments: req.body.attachments,
                },
              ),
            ),
          ),
        ),
    );
    routes.post<{ Params: Scope }>(
      `${base}/stop`,
      {
        schema: { params: conversationParams, body: creation },
      },
      (req) =>
        service.operation(() =>
          service.stopConversation(
            req.params.sessionId,
            req.params.conversationId,
          ),
        ),
    );
    routes.get<{ Params: Scope }>(
      `${base}/queue`,
      {
        schema: { params: conversationParams },
      },
      async (req) => ({
        items: await service.operation(() =>
          service.queue(req.params.sessionId, req.params.conversationId),
        ),
      }),
    );
    routes.patch<{
      Params: Scope & { submissionId: string };
      Body: {
        content: string;
        whenBusy: "steer" | "followUp";
        expectedContent: string;
        expectedWhenBusy: "steer" | "followUp";
      };
    }>(
      `${base}/queue/:submissionId`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            submissionId: recordId,
          }),
          body: {
            type: "object",
            additionalProperties: false,
            required: [
              "content",
              "whenBusy",
              "expectedContent",
              "expectedWhenBusy",
            ],
            properties: {
              content: { type: "string", maxLength: 32000 },
              expectedContent: { type: "string", maxLength: 32000 },
              whenBusy: { enum: ["steer", "followUp"] },
              expectedWhenBusy: { enum: ["steer", "followUp"] },
            },
          },
        },
      },
      (req) =>
        service.operation(() =>
          service.updateQueued(
            req.params.sessionId,
            req.params.conversationId,
            req.params.submissionId,
            req.body,
          ),
        ),
    );
    routes.delete<{ Params: Scope & { submissionId: string } }>(
      `${base}/queue/:submissionId`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            submissionId: recordId,
          }),
        },
      },
      (req) =>
        service.operation(() =>
          service.withdrawQueued(
            req.params.sessionId,
            req.params.conversationId,
            req.params.submissionId,
          ),
        ),
    );
    routes.get<{ Params: Scope & { entryId: string; index: string } }>(
      `${base}/entries/:entryId/attachments/:index`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            entryId: recordId,
            index: { type: "string", pattern: "^[0-3]$" },
          }),
        },
      },
      (req) =>
        service.operation(() =>
          service.attachment(
            req.params.sessionId,
            req.params.conversationId,
            req.params.entryId,
            Number(req.params.index),
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
              archived?: boolean;
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
              if (
                service.archives.get(
                  req.params.sessionId,
                  Number(req.params.conversationId),
                )
              ) {
                stop();
                return;
              }
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
