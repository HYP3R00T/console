import Fastify, { type FastifyServerOptions } from "fastify";

export function createApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            required: ["status"],
            additionalProperties: false,
            properties: {
              status: { type: "string", const: "ok" },
            },
          },
        },
      },
    },
    async () => ({ status: "ok" }),
  );

  return app;
}
