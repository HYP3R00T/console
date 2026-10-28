import Fastify, { type FastifyServerOptions } from "fastify";
import { type ConsoleOptions, registerConsole } from "./console.ts";

export function createApp(
  options: FastifyServerOptions = {},
  consoleOptions: ConsoleOptions = {},
) {
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

  app.register(registerConsole, { prefix: "/v1", ...consoleOptions });

  return app;
}
