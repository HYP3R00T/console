import type { FastifyInstance } from "fastify";
import { ProjectError, type ProjectService } from "./service.ts";
import type { Setup } from "./setup.ts";

export function registerProjectRoutes(
  app: FastifyInstance,
  service: ProjectService,
) {
  app.register(async (routes) => {
    routes.addHook("onSend", async (_request, reply, payload) => {
      reply.header("Cache-Control", "no-store");
      return payload;
    });
    routes.setErrorHandler((error, _request, reply) => {
      const status =
        error instanceof ProjectError
          ? error.statusCode
          : typeof error === "object" && error !== null && "validation" in error
            ? 400
            : 500;
      reply.code(status).send({
        ...(error instanceof ProjectError && error.code
          ? { code: error.code }
          : {}),
        error:
          error instanceof ProjectError
            ? error.message
            : status === 400
              ? "Invalid project request."
              : "Project operation failed.",
      });
    });
    const params = {
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: { id: { type: "string", format: "uuid" } },
    };
    routes.get("/v1/machine/settings", () => service.settings());
    routes.put<{ Body: { projectsRoot: string } }>(
      "/v1/machine/settings",
      {
        schema: {
          body: {
            type: "object",
            required: ["projectsRoot"],
            additionalProperties: false,
            properties: {
              projectsRoot: { type: "string", minLength: 1, maxLength: 4096 },
            },
          },
        },
      },
      (req) => service.saveSettings(req.body.projectsRoot),
    );
    for (const mode of ["create", "clone"] as const) {
      routes.post<{ Body: Setup }>(
        `/v1/projects/${mode}`,
        {
          schema: {
            body: {
              type: "object",
              required: [
                "name",
                "folder",
                "createParents",
                ...(mode === "clone" ? ["repository"] : []),
              ],
              additionalProperties: false,
              properties: {
                name: { type: "string", minLength: 1, maxLength: 120 },
                folder: { type: "string", minLength: 1, maxLength: 80 },
                createParents: { type: "boolean" },
                ...(mode === "clone"
                  ? {
                      repository: {
                        type: "string",
                        minLength: 1,
                        maxLength: 2048,
                      },
                    }
                  : {}),
              },
            },
          },
        },
        async (req, reply) => {
          const controller = new AbortController();
          const abort = () => {
            if (!reply.raw.writableEnded) controller.abort();
          };
          reply.raw.on("close", abort);
          req.raw.on("aborted", abort);
          try {
            return reply
              .code(201)
              .send(await service.setup(req.body, controller.signal));
          } finally {
            reply.raw.off("close", abort);
            req.raw.off("aborted", abort);
          }
        },
      );
    }
    routes.get("/v1/projects", () => service.list());
    routes.get("/v1/projects/archive", () => service.list(true));
    routes.post<{ Body: { name: string; path: string } }>(
      "/v1/projects",
      {
        schema: {
          body: {
            type: "object",
            required: ["name", "path"],
            additionalProperties: false,
            properties: {
              name: { type: "string", minLength: 1, maxLength: 120 },
              path: { type: "string", minLength: 1, maxLength: 4096 },
            },
          },
        },
      },
      async (req, reply) => {
        const project = await service.register(req.body.name, req.body.path);
        return reply.code(201).send(project);
      },
    );
    routes.get<{ Params: { id: string } }>(
      "/v1/projects/:id",
      { schema: { params } },
      (req) => service.get(req.params.id),
    );
    routes.get<{ Params: { id: string } }>(
      "/v1/projects/:id/git",
      { schema: { params } },
      (req) => service.gitMetadata(req.params.id),
    );
    routes.put<{
      Params: { id: string };
      Body: { name: string; icon: string; color: string };
    }>(
      "/v1/projects/:id",
      {
        schema: {
          params,
          body: {
            type: "object",
            required: ["name", "icon", "color"],
            additionalProperties: false,
            properties: {
              name: { type: "string", minLength: 1, maxLength: 120 },
              icon: {
                enum: [
                  "folder",
                  "code",
                  "terminal",
                  "book",
                  "flask",
                  "rocket",
                  "briefcase",
                  "palette",
                  "cpu",
                  "database",
                  "globe",
                  "server",
                  "layers",
                  "lightbulb",
                  "music",
                  "camera",
                  "pen-tool",
                  "graduation-cap",
                  "heart",
                  "shield",
                  "wrench",
                  "box",
                  "bot",
                  "compass",
                  "gamepad",
                  "leaf",
                  "coffee",
                  "notebook",
                  "puzzle",
                  "workflow",
                  "sparkles",
                  "zap",
                ],
              },
              color: {
                enum: [
                  "neutral",
                  "red",
                  "orange",
                  "amber",
                  "green",
                  "blue",
                  "purple",
                  "pink",
                ],
              },
            },
          },
        },
      },
      (req) =>
        service.update(
          req.params.id,
          req.body.name,
          req.body.icon,
          req.body.color,
        ),
    );
    routes.delete<{ Params: { id: string } }>(
      "/v1/projects/:id",
      { schema: { params } },
      (req) => service.archive(req.params.id),
    );
    routes.post<{ Params: { id: string } }>(
      "/v1/projects/:id/stop-and-archive",
      { schema: { params } },
      (req) => service.archive(req.params.id, true),
    );
    routes.post<{ Params: { id: string } }>(
      "/v1/projects/:id/restore",
      { schema: { params } },
      (req) => service.restore(req.params.id),
    );
  });
}
