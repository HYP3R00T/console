import {
  conversationConfigurationSchema,
  projectAgentSettingsSchema,
  sessionRuntimeSettingsSchema,
  workspaceGuidanceSchema,
} from "@console/contracts";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  type ConversationWatch,
  type Cursor,
  type DocumentWatch,
  StorageRequestError,
} from "@earendil-works/pi-durable";
import type { FastifyInstance } from "fastify";
import { ProjectError } from "../projects/service.ts";
import { ConfigurationFileError } from "../storage/owner-configuration.ts";
import { type AgentProfile, agentProfileSchema } from "./agent-profiles.ts";
import { AttachmentError, type AttachmentInput } from "./attachments.ts";
import type { ConfigurationChange } from "./configuration.ts";
import { ConversationInfo } from "./documents.ts";
import {
  type ReviewerProfile,
  reviewerProfileSchema,
} from "./reviewer-profiles.ts";
import { HarnessError, type HarnessService } from "./service.ts";
import {
  conversationView,
  historyWindow,
  messages,
  submissionView,
  taskGraphView,
} from "./view.ts";

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
        error instanceof AttachmentError ||
        error instanceof ConfigurationFileError;
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
    routes.get("/v1/machine/reviewer-profiles", () =>
      service.operation(() => service.reviewerProfiles()),
    );
    routes.put<{ Body: { revision: number; profiles: ReviewerProfile[] } }>(
      "/v1/machine/reviewer-profiles",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["revision", "profiles"],
            properties: {
              revision: { type: "integer", minimum: 0 },
              profiles: {
                type: "array",
                maxItems: 100,
                items: reviewerProfileSchema,
              },
            },
          },
        },
      },
      (req) =>
        service.operation(() =>
          service.updateReviewerProfiles(req.body.revision, req.body.profiles),
        ),
    );
    routes.get("/v1/machine/extensions/candidates", () =>
      service.operation(() => service.runtime.extensions.candidates()),
    );
    routes.post(
      "/v1/machine/extensions/reload",
      { schema: { body: creation } },
      () => service.operation(() => service.runtime.extensions.reload()),
    );
    for (const kind of ["mcp", "ssh", "extensions"] as const) {
      const manager =
        kind === "mcp"
          ? service.runtime.mcp
          : kind === "ssh"
            ? service.runtime.remote
            : service.runtime.extensions;
      const path = `/v1/machine/configuration/${kind}`;
      routes.get(path, () =>
        service.operation(async () => manager.configuration()),
      );
      routes.put<{ Body: { revision: string; configuration: unknown } }>(
        path,
        {
          bodyLimit: 80 * 1024,
          schema: {
            body: {
              type: "object",
              additionalProperties: false,
              required: ["revision", "configuration"],
              properties: {
                revision: {
                  type: "string",
                  pattern: "^(missing|[a-f0-9]{64})$",
                },
                configuration: { type: "object", additionalProperties: true },
              },
            },
          },
        },
        (req) =>
          service.operation(async () =>
            manager.updateConfiguration(
              req.body.revision,
              req.body.configuration,
            ),
          ),
      );
    }
    routes.get("/v1/machine/agent-profiles", () =>
      service.operation(() => service.agentProfiles()),
    );
    routes.put<{ Body: { revision: number; profiles: AgentProfile[] } }>(
      "/v1/machine/agent-profiles",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["revision", "profiles"],
            properties: {
              revision: { type: "integer", minimum: 0 },
              profiles: {
                type: "array",
                maxItems: 100,
                items: agentProfileSchema,
              },
            },
          },
        },
      },
      (req) =>
        service.operation(() =>
          service.updateAgentProfiles(req.body.revision, req.body.profiles),
        ),
    );
    routes.get("/v1/machine/workspace-guidance", () =>
      service.operation(async () => service.workspaceSettings()),
    );
    routes.patch<{ Body: ConfigurationChange }>(
      "/v1/machine/workspace-guidance",
      {
        config: {
          consoleCommand: {
            id: "machine.workspace-guidance.update",
            scope: "machine",
          },
        },
        schema: { body: workspaceGuidanceSchema },
      },
      (req) =>
        service.operation(async () =>
          service.updateWorkspaceSettings(req.body.revision, req.body),
        ),
    );
    routes.get<{ Params: { projectId: string } }>(
      "/v1/projects/:projectId/agent-settings",
      { schema: { params: params({ projectId: uuid }) } },
      (req) =>
        service.operation(async () =>
          service.projectAgentSettings(req.params.projectId),
        ),
    );
    routes.patch<{ Params: { projectId: string }; Body: ConfigurationChange }>(
      "/v1/projects/:projectId/agent-settings",
      {
        config: {
          consoleCommand: {
            id: "project.agent-settings.update",
            scope: "project",
          },
        },
        schema: {
          params: params({ projectId: uuid }),
          body: projectAgentSettingsSchema,
        },
      },
      (req) =>
        service.operation(async () =>
          service.updateProjectAgentSettings(
            req.params.projectId,
            req.body.revision,
            req.body,
          ),
        ),
    );
    routes.get<{ Params: { sessionId: string } }>(
      "/v1/sessions/:sessionId/runtime-settings",
      { schema: { params: params({ sessionId: uuid }) } },
      (req) =>
        service.operation(() =>
          service.sessionRuntimeSettings(req.params.sessionId),
        ),
    );
    routes.patch<{ Params: { sessionId: string }; Body: ConfigurationChange }>(
      "/v1/sessions/:sessionId/runtime-settings",
      {
        config: {
          consoleCommand: {
            id: "session.runtime-settings.update",
            scope: "session",
          },
        },
        schema: {
          params: params({ sessionId: uuid }),
          body: sessionRuntimeSettingsSchema,
        },
      },
      (req) =>
        service.operation(() =>
          service.updateSessionRuntimeSettings(
            req.params.sessionId,
            req.body.revision,
            req.body,
          ),
        ),
    );
    routes.get("/v1/machine/runtime-defaults", () =>
      service.operation(() => service.runtimeDefaults()),
    );
    routes.put<{
      Body: {
        revision: number;
        defaults: {
          model: { provider: string; modelId: string };
          thinkingLevel?: string;
        } | null;
      };
    }>(
      "/v1/machine/runtime-defaults",
      {
        config: {
          consoleCommand: {
            id: "machine.runtime-defaults.update",
            scope: "machine",
          },
        },
        schema: {
          body: {
            type: "object",
            required: ["revision", "defaults"],
            additionalProperties: false,
            properties: {
              revision: { type: "integer", minimum: 0 },
              defaults: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    required: ["model"],
                    additionalProperties: false,
                    properties: {
                      model,
                      thinkingLevel: {
                        type: "string",
                        minLength: 1,
                        maxLength: 40,
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      (req) =>
        service.operation(() =>
          service.updateRuntimeDefaults(req.body.revision, req.body.defaults),
        ),
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
    routes.get<{ Params: { sessionId: string; conversationId: string } }>(
      "/v1/standalone/:sessionId/:conversationId",
      {
        schema: {
          params: params({ sessionId: uuid, conversationId: recordId }),
        },
      },
      (req) =>
        service.operation(() =>
          service.standalone(
            req.params.sessionId,
            false,
            req.params.conversationId,
          ),
        ),
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
      `${base}/agents`,
      { schema: { params: conversationParams } },
      (req) =>
        service.operation(() =>
          service.listAgents(req.params.sessionId, req.params.conversationId),
        ),
    );
    routes.post<{
      Params: Scope;
      Body: { id: string; name: string; profileId?: string };
    }>(
      `${base}/agents`,
      {
        schema: {
          params: conversationParams,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["id", "name"],
            properties: {
              id: uuid,
              profileId: uuid,
              name: { type: "string", minLength: 1, maxLength: 100 },
            },
          },
        },
      },
      (req, reply) =>
        service.operation(async () =>
          reply
            .code(201)
            .send(
              await service.createAgent(
                req.params.sessionId,
                req.params.conversationId,
                req.body.id,
                req.body.name,
                req.body.profileId,
              ),
            ),
        ),
    );
    const agentParams = params({
      sessionId: uuid,
      conversationId: recordId,
      agentId: uuid,
    });
    routes.post<{
      Params: Scope & { agentId: string };
      Body: {
        content: string;
        requestId: string;
        whenBusy?: "steer" | "followUp";
        delivery?: "display" | "context" | "followUp";
      };
    }>(
      `${base}/agents/:agentId/messages`,
      {
        schema: {
          params: agentParams,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["content", "requestId"],
            properties: {
              content: { type: "string", minLength: 1, maxLength: 32000 },
              requestId: uuid,
              whenBusy: { enum: ["steer", "followUp"] },
              delivery: { enum: ["display", "context", "followUp"] },
            },
          },
        },
      },
      (req, reply) =>
        service.operation(async () =>
          reply
            .code(202)
            .send(
              await service.messageAgent(
                req.params.sessionId,
                req.params.conversationId,
                req.params.agentId,
                req.body.content,
                req.body.requestId,
                req.body.whenBusy,
                req.body.delivery,
              ),
            ),
        ),
    );
    routes.post<{ Params: Scope & { agentId: string } }>(
      `${base}/agents/:agentId/stop`,
      { schema: { params: agentParams, body: creation } },
      (req) =>
        service.operation(() =>
          service.stopAgent(
            req.params.sessionId,
            req.params.conversationId,
            req.params.agentId,
          ),
        ),
    );
    routes.get<{ Params: Scope & { agentId: string } }>(
      `${base}/agents/:agentId`,
      { schema: { params: agentParams } },
      (req) =>
        service.operation(async () => {
          const { agent, child } = await service.persistentAgent(
            req.params.sessionId,
            req.params.conversationId,
            req.params.agentId,
          );
          const watch = await child.watch(context);
          try {
            const snapshot = conversationView(watch.value);
            return {
              agent,
              messages: snapshot.messages,
              partial: snapshot.partial,
              busy: snapshot.busy,
              execution: snapshot.execution,
            };
          } finally {
            await watch.stop();
          }
        }),
    );
    routes.get<{ Params: Scope }>(
      `${base}/tasks`,
      { schema: { params: conversationParams } },
      (req) =>
        service.operation(async () => {
          const { graph, root, owned } = await service.activeTasks(
            req.params.sessionId,
            req.params.conversationId,
          );
          return taskGraphView(graph, root, owned);
        }),
    );
    routes.get<{
      Params: Scope;
      Querystring: { cursor?: string; reviewId?: string };
    }>(
      `${base}/tasks/history`,
      {
        schema: {
          params: conversationParams,
          querystring: {
            type: "object",
            additionalProperties: false,
            properties: {
              cursor: { type: "string", maxLength: 4096 },
              reviewId: recordId,
            },
          },
        },
      },
      (req) =>
        service.operation(async () => {
          const scope = `${req.params.sessionId}/${req.params.conversationId}/${req.query.reviewId ?? "root"}`;
          let cursor: Cursor | undefined;
          if (req.query.cursor) {
            try {
              const value = JSON.parse(
                Buffer.from(req.query.cursor, "base64url").toString(),
              );
              if (
                !value ||
                value.scope !== scope ||
                !value.next ||
                typeof value.next !== "object" ||
                Array.isArray(value.next)
              )
                throw new Error();
              cursor = value.next;
            } catch {
              throw new HarnessError(400, "Invalid task history cursor.");
            }
          }
          const page = await service.taskHistory(
            req.params.sessionId,
            req.params.conversationId,
            cursor,
            req.query.reviewId,
          );
          return {
            tasks: page.tasks,
            ...(page.cursor && {
              cursor: Buffer.from(
                JSON.stringify({ scope, next: page.cursor }),
              ).toString("base64url"),
            }),
          };
        }),
    );
    routes.post<{
      Params: Scope;
      Body: {
        content: string;
        profileId?: string;
        requestId: string;
        at?: number;
        delivery?: "display" | "context" | "followUp";
        recurrence?: { intervalMs: number; occurrences: number };
      };
    }>(
      `${base}/jobs`,
      {
        schema: {
          params: conversationParams,
          body: {
            ...creation,
            required: ["content", "requestId"],
            properties: {
              content: { type: "string", minLength: 1, maxLength: 32000 },
              requestId: uuid,
              profileId: uuid,
              at: { type: "integer", minimum: 0, maximum: 8640000000000000 },
              delivery: {
                type: "string",
                enum: ["display", "context", "followUp"],
              },
              recurrence: {
                type: "object",
                additionalProperties: false,
                required: ["intervalMs", "occurrences"],
                properties: {
                  intervalMs: {
                    type: "integer",
                    minimum: 60000,
                    maximum: 31536000000,
                  },
                  occurrences: { type: "integer", minimum: 2, maximum: 1000 },
                },
              },
            },
          },
        },
      },
      async (req, reply) =>
        reply
          .code(202)
          .send(
            await service.operation(() =>
              service.scheduleJob(
                req.params.sessionId,
                req.params.conversationId,
                req.body.content,
                req.body.requestId,
                req.body.at,
                req.body.delivery,
                req.body.recurrence,
                req.body.profileId,
              ),
            ),
          ),
    );
    routes.delete<{ Params: Scope & { taskId: string } }>(
      `${base}/jobs/:taskId`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            taskId: recordId,
          }),
        },
      },
      (req) =>
        service.operation(() =>
          service.stopJob(
            req.params.sessionId,
            req.params.conversationId,
            req.params.taskId,
          ),
        ),
    );
    routes.post<{
      Params: Scope;
      Body: {
        brief: string;
        requestId: string;
        at?: number;
        delivery?: "display" | "context" | "followUp";
        model?: { provider: string; modelId: string };
        thinkingLevel?: string | null;
        maxTurns?: number;
        passes?: number;
        worktree?: string;
        profileId?: string;
        recurrence?: { intervalMs: number; occurrences: number };
      };
    }>(
      `${base}/reviews`,
      {
        schema: {
          params: conversationParams,
          body: {
            ...creation,
            required: ["brief", "requestId"],
            properties: {
              brief: { type: "string", minLength: 1, maxLength: 8000 },
              model,
              thinkingLevel: { type: ["string", "null"], maxLength: 40 },
              maxTurns: { type: "integer", minimum: 1, maximum: 50 },
              passes: { type: "integer", minimum: 1, maximum: 5 },
              worktree: { type: "string", minLength: 1, maxLength: 4096 },
              profileId: uuid,
              recurrence: {
                type: "object",
                additionalProperties: false,
                required: ["intervalMs", "occurrences"],
                properties: {
                  intervalMs: {
                    type: "integer",
                    minimum: 60000,
                    maximum: 31536000000,
                  },
                  occurrences: { type: "integer", minimum: 2, maximum: 1000 },
                },
              },
              delivery: {
                type: "string",
                enum: ["display", "context", "followUp"],
              },
              requestId: uuid,
              at: { type: "integer", minimum: 0, maximum: 8640000000000000 },
            },
          },
        },
      },
      async (req, reply) =>
        reply.code(202).send(
          await service.operation(() =>
            service.scheduleReview(
              req.params.sessionId,
              req.params.conversationId,
              req.body.brief,
              req.body.requestId,
              req.body.at,
              req.body.delivery,
              {
                model: req.body.model,
                thinkingLevel: req.body.thinkingLevel,
                maxTurns: req.body.maxTurns,
                passes: req.body.passes,
                worktree: req.body.worktree,
                profileId: req.body.profileId,
                recurrence: req.body.recurrence,
              },
            ),
          ),
        ),
    );
    routes.post<{
      Params: Scope & { taskId: string };
      Body: { requestId: string; acknowledgeEffects: true };
    }>(
      `${base}/checks/tasks/:taskId/recheck`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            taskId: recordId,
          }),
          body: {
            ...creation,
            required: ["requestId", "acknowledgeEffects"],
            properties: {
              requestId: uuid,
              acknowledgeEffects: { type: "boolean", const: true },
            },
          },
        },
      },
      async (req, reply) =>
        reply
          .code(202)
          .send(
            await service.operation(() =>
              service.recheck(
                req.params.sessionId,
                req.params.conversationId,
                req.params.taskId,
                req.body.requestId,
              ),
            ),
          ),
    );
    routes.post<{
      Params: Scope & { taskId: string };
      Body: { requestId: string; acknowledgeEffects: true };
    }>(
      `${base}/jobs/tasks/:taskId/retry`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            taskId: recordId,
          }),
          body: {
            ...creation,
            required: ["requestId", "acknowledgeEffects"],
            properties: {
              requestId: uuid,
              acknowledgeEffects: { type: "boolean", const: true },
            },
          },
        },
      },
      async (req, reply) =>
        reply
          .code(202)
          .send(
            await service.operation(() =>
              service.retryJob(
                req.params.sessionId,
                req.params.conversationId,
                req.params.taskId,
                req.body.requestId,
              ),
            ),
          ),
    );
    routes.post<{
      Params: Scope & { taskId: string };
      Body: { requestId: string };
    }>(
      `${base}/reviews/tasks/:taskId/retry`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            taskId: recordId,
          }),
          body: {
            ...creation,
            required: ["requestId"],
            properties: { requestId: uuid },
          },
        },
      },
      async (req, reply) =>
        reply
          .code(202)
          .send(
            await service.operation(() =>
              service.retryReview(
                req.params.sessionId,
                req.params.conversationId,
                req.params.taskId,
                req.body.requestId,
              ),
            ),
          ),
    );
    routes.delete<{ Params: Scope & { taskId: string } }>(
      `${base}/reviews/tasks/:taskId`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            taskId: recordId,
          }),
        },
      },
      (req) =>
        service.operation(() =>
          service.stopReview(
            req.params.sessionId,
            req.params.conversationId,
            req.params.taskId,
          ),
        ),
    );
    routes.get<{ Params: Scope & { taskId: string } }>(
      `${base}/jobs/:taskId`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            taskId: recordId,
          }),
        },
      },
      (req) =>
        service.operation(async () => {
          const review = await service.jobConversation(
            req.params.sessionId,
            req.params.conversationId,
            req.params.taskId,
          );
          const watch = await review.watch(context);
          try {
            const snapshot = conversationView(watch.value);
            return {
              messages: snapshot.messages.map(({ id, role, text, failed }) => ({
                id,
                role,
                text: text.slice(0, 16000),
                failed,
              })),
              partial: snapshot.partial.slice(0, 16000),
              busy: snapshot.busy,
              execution: snapshot.execution,
            };
          } finally {
            await watch.stop();
          }
        }),
    );
    routes.get<{ Params: Scope & { reviewId: string } }>(
      `${base}/reviews/:reviewId`,
      {
        schema: {
          params: params({
            sessionId: uuid,
            conversationId: recordId,
            reviewId: recordId,
          }),
        },
      },
      (req) =>
        service.operation(async () => {
          const review = await service.review(
            req.params.sessionId,
            req.params.conversationId,
            req.params.reviewId,
          );
          const watch = await review.watch(context);
          try {
            const snapshot = conversationView(watch.value);
            return {
              messages: snapshot.messages.map(({ id, role, text, failed }) => ({
                id,
                role,
                text: text.slice(0, 16000),
                failed,
              })),
              partial: snapshot.partial.slice(0, 16000),
              busy: snapshot.busy,
              execution: snapshot.execution,
            };
          } finally {
            await watch.stop();
          }
        }),
    );
    routes.get<{ Params: Scope }>(
      `${base}/worktrees`,
      { schema: { params: conversationParams } },
      (req) =>
        service.operation(() =>
          service.worktrees(req.params.sessionId, req.params.conversationId),
        ),
    );
    routes.post<{ Params: Scope }>(
      `${base}/mcp/reconnect`,
      { schema: { params: conversationParams, body: creation } },
      (req) =>
        service.operation(async () => {
          await service.conversation(
            req.params.sessionId,
            req.params.conversationId,
          );
          return service.runtime.mcp.reconnect();
        }),
    );
    for (const target of ["mcp", "remote"] as const) {
      routes.post<{ Params: Scope }>(
        `${base}/${target}/reload`,
        { schema: { params: conversationParams, body: creation } },
        (req) =>
          service.operation(async () => {
            await service.conversation(
              req.params.sessionId,
              req.params.conversationId,
            );
            return service.runtime[target].reload();
          }),
      );
    }
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

    routes.post<{ Params: Scope; Body: { at: number; creationId: string } }>(
      `${base}/fork`,
      {
        schema: {
          params: conversationParams,
          body: {
            ...creation,
            required: ["at", "creationId"],
            properties: {
              at: {
                type: "integer",
                minimum: 1,
                maximum: Number.MAX_SAFE_INTEGER,
              },
              creationId: uuid,
            },
          },
        },
      },
      async (req, reply) =>
        reply
          .code(201)
          .send(
            await service.operation(() =>
              service.forkConversation(
                req.params.sessionId,
                req.params.conversationId,
                req.body.at,
                req.body.creationId,
              ),
            ),
          ),
    );

    routes.patch<{ Params: Scope; Body: ConfigurationChange }>(
      `${base}/configuration`,
      {
        config: {
          consoleCommand: {
            id: "conversation.configure",
            scope: "conversation",
          },
        },
        schema: {
          params: conversationParams,
          body: conversationConfigurationSchema,
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
    routes.post<{ Params: Scope; Body: { focus?: string } }>(
      `${base}/compact`,
      {
        config: {
          consoleCommand: { id: "conversation.compact", scope: "conversation" },
        },
        schema: {
          params: conversationParams,
          body: {
            ...creation,
            properties: { focus: { type: "string", maxLength: 2000 } },
          },
        },
      },
      async (req, reply) => {
        const task = await service.operation(() =>
          service.compactConversation(
            req.params.sessionId,
            req.params.conversationId,
            req.body.focus,
          ),
        );
        return reply.code(202).send(task);
      },
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
    routes.post<{ Params: Scope; Body: { failedTaskId: number } }>(
      `${base}/continue`,
      {
        config: {
          consoleCommand: {
            id: "conversation.continue",
            scope: "conversation",
          },
        },
        schema: {
          params: conversationParams,
          body: {
            ...creation,
            required: ["failedTaskId"],
            properties: {
              failedTaskId: {
                type: "integer",
                minimum: 1,
                maximum: Number.MAX_SAFE_INTEGER,
              },
            },
          },
        },
      },
      async (req, reply) =>
        reply
          .code(202)
          .send(
            await service.operation(() =>
              service.continueConversation(
                req.params.sessionId,
                req.params.conversationId,
                req.body.failedTaskId,
              ),
            ),
          ),
    );
    routes.post<{ Params: Scope }>(
      `${base}/stop`,
      {
        config: {
          consoleCommand: { id: "conversation.stop", scope: "conversation" },
        },
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
    routes.get<{
      Params: Scope;
      Querystring: { cursor?: string; before?: string };
    }>(
      `${base}/history`,
      {
        schema: {
          params: conversationParams,
          querystring: {
            type: "object",
            additionalProperties: false,
            properties: {
              cursor: { type: "string", maxLength: 4096 },
              before: { type: "string", pattern: "^[1-9][0-9]{0,14}$" },
            },
          },
        },
      },
      (req) =>
        service.operation(async () => {
          if (req.query.cursor && req.query.before)
            throw new HarnessError(
              400,
              "Choose a cursor or an entry boundary.",
            );
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
            req.query.before === undefined
              ? undefined
              : Number(req.query.before),
          );
          const entries = [...page.items].reverse();
          // Ask for the actual predecessor: IDs can be shared with sibling conversations.
          const preceding = entries.length
            ? await service.history(
                req.params.sessionId,
                req.params.conversationId,
                undefined,
                entries[0].id,
                1,
              )
            : undefined;
          return {
            messages: messages(entries),
            history: historyWindow(entries, preceding?.items[0]?.id),
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
            watch.start(async (call) => {
              if (call.kind === "value") await send(call.value);
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
