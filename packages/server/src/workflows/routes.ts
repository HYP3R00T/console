import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type WorkflowDefinition,
  workflowDefinitionSchema,
} from "@console/contracts";
import type { FastifyInstance } from "fastify";
import { HarnessError } from "../harnesses/service.ts";
import { ProjectError } from "../projects/errors.ts";
import type { WorkflowService } from "./service.ts";

const uuid = { type: "string", format: "uuid" };
const inputs = {
  type: "object",
  maxProperties: 30,
  propertyNames: { pattern: "^[a-zA-Z0-9_-]{1,64}$" },
  additionalProperties: { type: "string", maxLength: 32000 },
};
const base = "/v1/projects/:projectId/workflows";
type ProjectParams = { projectId: string; id: string };
const scopeSchema = {
  type: "object",
  required: ["projectId"],
  properties: { projectId: uuid, id: uuid },
};
const runParams = {
  type: "object",
  required: ["projectId", "sessionId", "taskId"],
  properties: {
    projectId: uuid,
    sessionId: uuid,
    taskId: { type: "string", pattern: "^[0-9]{1,15}$" },
  },
};
type RunParams = { projectId: string; sessionId: string; taskId: string };
export function registerWorkflowRoutes(
  app: FastifyInstance,
  service: WorkflowService,
) {
  app.register(async (routes) => {
    routes.addHook("onSend", async (_request, reply, payload) => {
      reply.header("Cache-Control", "no-store");
      return payload;
    });
    routes.setErrorHandler((error, _request, reply) => {
      const known =
        error instanceof HarnessError || error instanceof ProjectError;
      const invalid =
        typeof error === "object" && error !== null && "validation" in error;
      reply.code(known ? error.statusCode : invalid ? 400 : 500).send({
        error: known
          ? error.message
          : invalid
            ? "Invalid workflow request."
            : "Workflow operation failed.",
      });
    });
    routes.get<{ Params: ProjectParams }>(
      base,
      { schema: { params: scopeSchema } },
      async (request) => ({
        workflows: service.list(request.params.projectId),
        triggerError: service.lastTriggerError,
      }),
    );
    routes.put<{
      Params: ProjectParams;
      Body: {
        revision: number;
        definition: WorkflowDefinition;
        sessionId: string;
        conversationId: string;
        enabled: boolean;
      };
    }>(
      `${base}/:id`,
      {
        schema: {
          params: scopeSchema,
          body: {
            type: "object",
            additionalProperties: false,
            required: [
              "revision",
              "definition",
              "sessionId",
              "conversationId",
              "enabled",
            ],
            properties: {
              revision: { type: "integer", minimum: 0, maximum: 2147483646 },
              definition: workflowDefinitionSchema,
              sessionId: uuid,
              conversationId: { type: "string", pattern: "^[0-9]{1,15}$" },
              enabled: { type: "boolean" },
            },
          },
        },
      },
      (request) =>
        service.save(
          request.params.projectId,
          request.params.id,
          request.body.revision,
          request.body.definition,
          request.body.sessionId,
          request.body.conversationId,
          request.body.enabled,
        ),
    );
    routes.get<{ Params: ProjectParams }>(
      `${base}/:id/versions`,
      { schema: { params: scopeSchema } },
      (request) => ({
        versions: service.versions(request.params.projectId, request.params.id),
      }),
    );
    routes.post<{
      Params: ProjectParams;
      Body: { requestId: string; input: Record<string, string> };
    }>(
      `${base}/:id/runs`,
      {
        schema: {
          params: scopeSchema,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["requestId", "input"],
            properties: { requestId: uuid, input: inputs },
          },
        },
      },
      (request) =>
        service.start(
          request.params.projectId,
          request.params.id,
          request.body.requestId,
          request.body.input,
        ),
    );
    const runBase = "/v1/projects/:projectId/workflow-runs";
    routes.get<{ Params: ProjectParams }>(
      runBase,
      { schema: { params: scopeSchema } },
      async (request) => ({
        runs: await service.runs(request.params.projectId),
      }),
    );
    routes.get<{ Params: RunParams }>(
      `${runBase}/:sessionId/:taskId`,
      { schema: { params: runParams } },
      (request) =>
        service.run(
          request.params.projectId,
          request.params.sessionId,
          Number(request.params.taskId),
        ),
    );
    routes.post<{
      Params: RunParams;
      Body: { revision: string; decision: "approved" | "rejected" };
    }>(
      `${runBase}/:sessionId/:taskId/decision`,
      {
        schema: {
          params: runParams,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["revision", "decision"],
            properties: {
              revision: { type: "string", pattern: "^[a-f0-9]{64}$" },
              decision: { enum: ["approved", "rejected"] },
            },
          },
        },
      },
      (request) =>
        service.decide(
          request.params.projectId,
          request.params.sessionId,
          Number(request.params.taskId),
          request.body.revision,
          request.body.decision,
          request.consoleClientId ?? "local-owner",
        ),
    );
    routes.post<{ Params: RunParams; Body: { revision: string } }>(
      `${runBase}/:sessionId/:taskId/invalidate`,
      {
        schema: {
          params: runParams,
          body: {
            type: "object",
            additionalProperties: false,
            required: ["revision"],
            properties: {
              revision: { type: "string", pattern: "^[a-f0-9]{64}$" },
            },
          },
        },
      },
      (request) =>
        service.invalidate(
          request.params.projectId,
          request.params.sessionId,
          Number(request.params.taskId),
          request.body.revision,
        ),
    );
    routes.delete<{ Params: RunParams }>(
      `${runBase}/:sessionId/:taskId`,
      { schema: { params: runParams } },
      (request) =>
        service.stop(
          request.params.projectId,
          request.params.sessionId,
          Number(request.params.taskId),
        ),
    );
  });

  app.register(async (hooks) => {
    hooks.removeContentTypeParser("application/json");
    hooks.addContentTypeParser(
      "application/json",
      { parseAs: "buffer", bodyLimit: 1024 * 1024 },
      (_request, body, done) => done(null, body),
    );
    hooks.post<{ Params: { projectId: string }; Body: Buffer }>(
      "/v1/hooks/github/:projectId",
      { schema: { params: scopeSchema } },
      async (request, reply) => {
        const secret = process.env.CONSOLE_GITHUB_WEBHOOK_SECRET;
        if (!secret)
          return reply
            .code(503)
            .send({ error: "GitHub webhooks are not configured." });
        const signature = request.headers["x-hub-signature-256"];
        const delivery = request.headers["x-github-delivery"];
        if (
          typeof signature !== "string" ||
          !/^sha256=[a-f0-9]{64}$/.test(signature) ||
          typeof delivery !== "string" ||
          !/^[a-zA-Z0-9-]{1,100}$/.test(delivery)
        )
          return reply
            .code(401)
            .send({ error: "Invalid webhook signature or delivery identity." });
        const expected = createHmac("sha256", secret)
          .update(request.body)
          .digest();
        if (!timingSafeEqual(Buffer.from(signature.slice(7), "hex"), expected))
          return reply.code(401).send({ error: "Invalid webhook signature." });
        let payload: {
          repository?: { full_name?: string };
          action?: string;
          issue?: { number?: number; title?: string; body?: string };
          pull_request?: {
            number?: number;
            title?: string;
            body?: string;
            head?: { sha?: string };
          };
        };
        try {
          payload = JSON.parse(request.body.toString("utf8"));
        } catch {
          return reply.code(400).send({ error: "Invalid webhook JSON." });
        }
        if (!payload || typeof payload !== "object")
          return reply.code(400).send({ error: "Invalid webhook payload." });
        if (
          payload.repository?.full_name !== undefined &&
          typeof payload.repository.full_name !== "string"
        )
          return reply
            .code(400)
            .send({ error: "Invalid repository identity." });
        const event = request.headers["x-github-event"];
        const runs = [];
        const item = payload.issue ?? payload.pull_request;
        for (const workflow of service.list(request.params.projectId)) {
          const trigger = workflow.definition.trigger;
          if (
            !workflow.enabled ||
            trigger?.type !== "github" ||
            trigger.repository.toLowerCase() !==
              payload.repository?.full_name?.toLowerCase() ||
            trigger.event !== event ||
            trigger.action !== payload.action
          )
            continue;
          runs.push(
            await service.start(
              workflow.projectId,
              workflow.id,
              `github:${delivery}`,
              {
                repository: trigger.repository,
                number: String(item?.number ?? ""),
                title: String(item?.title ?? "").slice(0, 32000),
                body: String(item?.body ?? "").slice(0, 32000),
                sha: String(payload.pull_request?.head?.sha ?? ""),
                event: String(event),
                action: String(payload.action),
              },
              workflow.version,
            ),
          );
        }
        return { runs };
      },
    );
  });
}
