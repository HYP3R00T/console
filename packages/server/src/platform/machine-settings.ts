import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Models } from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai/models";
import type { FastifyInstance } from "fastify";
import { httpError } from "../http/errors.ts";
import type { AgentConfiguration } from "../runtime/documents.ts";

export type MachineSettings = {
  name: string;
  projectsDirectory: string;
  defaultConfiguration: AgentConfiguration | null;
  lastConfiguration: AgentConfiguration | null;
};
export function openMachineSettings(directory: string, name: string) {
  const db = new DatabaseSync(join(directory, "catalog.sqlite"));
  db.exec(
    "CREATE TABLE IF NOT EXISTS machine_settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)",
  );
  db.prepare("INSERT OR IGNORE INTO machine_settings VALUES (1, ?)").run(
    JSON.stringify({
      name,
      projectsDirectory: join(homedir(), "Projects"),
      defaultConfiguration: null,
      lastConfiguration: null,
    }),
  );
  const get = () =>
    JSON.parse(
      String(
        db.prepare("SELECT value FROM machine_settings WHERE id=1").get()
          ?.value,
      ),
    ) as MachineSettings;
  const save = (value: MachineSettings) => {
    db.prepare("UPDATE machine_settings SET value=? WHERE id=1").run(
      JSON.stringify(value),
    );
    return value;
  };
  return {
    get,
    save,
    remember(configuration: AgentConfiguration) {
      save({ ...get(), lastConfiguration: configuration });
    },
    close: () => db.close(),
  };
}
export function registerMachineSettings(
  app: FastifyInstance,
  settings: ReturnType<typeof openMachineSettings>,
  models: Models,
  directory: string,
) {
  const configuration = {
    type: "object",
    required: ["provider", "model"],
    additionalProperties: false,
    properties: {
      provider: { type: "string", minLength: 1, maxLength: 200 },
      model: { type: "string", minLength: 1, maxLength: 200 },
      thinkingLevel: { type: "string", maxLength: 24 },
    },
  };
  app.get("/machine-settings", async () => ({
    ...settings.get(),
    runtime: {
      node: process.version,
      pi: JSON.parse(
        readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
      ).dependencies["@earendil-works/pi-durable"],
      git: await new Promise<boolean>((accept) =>
        execFile("git", ["--version"], { timeout: 3000 }, (error) =>
          accept(!error),
        ),
      ),
    },
  }));
  app.patch<{ Body: Omit<MachineSettings, "lastConfiguration"> }>(
    "/machine-settings",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "projectsDirectory", "defaultConfiguration"],
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              pattern: "\\S",
            },
            projectsDirectory: {
              type: "string",
              minLength: 1,
              maxLength: 2000,
            },
            defaultConfiguration: { anyOf: [configuration, { type: "null" }] },
          },
        },
      },
    },
    async (req) => {
      const input = req.body;
      if (!isAbsolute(input.projectsDirectory))
        throw httpError(400, "Projects directory must be absolute.");
      const path = resolve(input.projectsDirectory);
      if (
        path === directory ||
        path.startsWith(directory + sep) ||
        directory.startsWith(path + sep) ||
        path === resolve(path, "..")
      )
        throw httpError(
          400,
          "Projects must stay outside Console's private storage.",
        );
      if (input.defaultConfiguration) {
        const chosen = input.defaultConfiguration;
        const model = models.getModel(chosen.provider, chosen.model);
        if (!model || !(await models.checkAuth(chosen.provider)))
          throw httpError(
            400,
            "Choose a connected provider and available model.",
          );
        if (
          chosen.thinkingLevel &&
          !getSupportedThinkingLevels(model).includes(chosen.thinkingLevel)
        )
          throw httpError(400, "Unsupported thinking level.");
      }
      return settings.save({
        ...settings.get(),
        ...input,
        name: input.name.trim(),
        projectsDirectory: path,
      });
    },
  );
}
