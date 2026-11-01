import type { FastifyInstance } from "fastify";
import { ProviderError, type ProviderService } from "./service.ts";

const providerParams = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", minLength: 1, maxLength: 120 } },
};
const booleanBody = (key: string) => ({
  type: "object",
  required: [key],
  additionalProperties: false,
  properties: { [key]: { type: "boolean" } },
});

export function registerProviderRoutes(
  app: FastifyInstance,
  service: ProviderService,
) {
  // Isolate provider errors and never serialize SDK/storage errors or submitted secrets.
  app.register(async (routes) => {
    routes.addHook("onSend", async (_request, reply, payload) => {
      reply.header("Cache-Control", "no-store");
      return payload;
    });
    routes.setErrorHandler((error, _request, reply) => {
      const status =
        error instanceof ProviderError
          ? error.statusCode
          : typeof error === "object" && error !== null && "validation" in error
            ? 400
            : 500;
      return reply.code(status).send({
        error:
          error instanceof ProviderError
            ? error.message
            : status === 400
              ? "Invalid provider request."
              : "Provider operation failed.",
      });
    });
    routes.get("/v1/providers", () => service.overview());
    routes.get("/v1/models/favorites", () => service.favorites());
    routes.get<{ Params: { id: string } }>(
      "/v1/providers/:id/models",
      { schema: { params: providerParams } },
      (req) => service.modelList(req.params.id),
    );
    routes.put<{ Params: { id: string }; Body: { enabled: boolean } }>(
      "/v1/providers/:id",
      { schema: { params: providerParams, body: booleanBody("enabled") } },
      (req) => service.enable(req.params.id, req.body.enabled),
    );
    routes.delete<{ Params: { id: string } }>(
      "/v1/providers/:id",
      { schema: { params: providerParams } },
      (req) => service.remove(req.params.id),
    );
    routes.post<{ Params: { id: string } }>(
      "/v1/providers/:id/refresh",
      { schema: { params: providerParams } },
      (req) => service.refresh(req.params.id),
    );
    routes.put<{
      Params: { id: string; model: string };
      Body: { favorite: boolean };
    }>(
      "/v1/providers/:id/models/:model/favorite",
      {
        schema: {
          params: {
            ...providerParams,
            required: ["id", "model"],
            properties: {
              ...providerParams.properties,
              model: { type: "string", minLength: 1, maxLength: 500 },
            },
          },
          body: booleanBody("favorite"),
        },
      },
      (req) =>
        service.favorite(req.params.id, req.params.model, req.body.favorite),
    );
    routes.post<{
      Params: { id: string };
      Body: { type: "api_key" | "oauth" };
    }>(
      "/v1/providers/:id/login",
      {
        schema: {
          params: providerParams,
          body: {
            type: "object",
            required: ["type"],
            additionalProperties: false,
            properties: { type: { enum: ["api_key", "oauth"] } },
          },
        },
      },
      (req) => service.start(req.params.id, req.body.type),
    );
    routes.get<{ Params: { id: string } }>(
      "/v1/provider-logins/:id",
      { schema: { params: providerParams } },
      (req) => service.login(req.params.id).view,
    );
    routes.post<{
      Params: { id: string };
      Body: { promptId: string; value: string };
    }>(
      "/v1/provider-logins/:id/answer",
      {
        bodyLimit: 128 * 1024,
        schema: {
          params: providerParams,
          body: {
            type: "object",
            required: ["promptId", "value"],
            additionalProperties: false,
            properties: {
              promptId: { type: "string", maxLength: 100 },
              value: { type: "string", maxLength: 64000 },
            },
          },
        },
      },
      (req) => service.answer(req.params.id, req.body.promptId, req.body.value),
    );
    routes.delete<{ Params: { id: string } }>(
      "/v1/provider-logins/:id",
      { schema: { params: providerParams } },
      (req) => service.cancel(req.params.id),
    );
  });
}
