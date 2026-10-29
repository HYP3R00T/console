import { Type } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  section,
} from "@earendil-works/pi-durable";
import { loadProjectResource, projectResources } from "./resources.ts";

export function projectExtension() {
  return defineExtension({
    name: "console.project",
    tools: [
      defineTool({
        name: "load_project_resource",
        description: "Load a project skill, prompt, or directory instructions.",
        parameters: Type.Object(
          {
            kind: Type.Union([
              Type.Literal("instructions"),
              Type.Literal("skill"),
              Type.Literal("prompt"),
            ]),
            name: Type.Optional(Type.String({ maxLength: 100 })),
            directory: Type.Optional(Type.String({ maxLength: 2000 })),
          },
          { additionalProperties: false },
        ),
        replay: "safe",
        async execute(args, api) {
          const cwd = api.env?.cwd;
          if (!cwd) throw new Error("Project directory is unavailable");
          const value =
            args.kind === "instructions"
              ? projectResources(cwd, args.directory)
              : loadProjectResource(cwd, args.kind, args.name ?? "");
          return { output: [{ type: "text", text: JSON.stringify(value) }] };
        },
      }),
    ],
    sections: [
      section("project-context", async (input) => {
        const cwd = input.env?.cwd;
        if (!cwd) return undefined;
        const resources = projectResources(cwd);
        return [
          `Working directory: ${cwd}. Tools execute directly on the host.`,
          ...resources.instructions.map(
            (item) =>
              `<project-instructions path=${JSON.stringify(item.path)}>\n${item.content}\n</project-instructions>`,
          ),
          resources.skills.length
            ? `Project skills (load with load_project_resource before use):\n${resources.skills.map((item) => `${item.name}: ${item.description} (${item.path})`).join("\n")}`
            : "",
          resources.prompts.length
            ? `Project prompt templates: ${resources.prompts.map((item) => item.name).join(", ")}`
            : "",
          "Check directory instructions with load_project_resource before working in a subdirectory.",
        ]
          .filter(Boolean)
          .join("\n\n");
      }),
    ],
  });
}
