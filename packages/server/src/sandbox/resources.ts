// Filesystem helpers run inside nono (or fixture tests); prompt expansion is pure.
import {
  closeSync,
  constants,
  type Dirent,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

export type ProjectResource = { name: string; path: string; content: string };
export type ProjectResources = {
  instructions: ProjectResource[];
  skills: { name: string; path: string; description: string }[];
  prompts: { name: string; path: string; description: string }[];
};

function read(path: string) {
  try {
    if (!lstatSync(path).isFile()) return undefined;
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const buffer = Buffer.alloc(32769);
      const length = readSync(fd, buffer);
      if (length > 32768) throw new Error("Project resource exceeds 32 KiB");
      return buffer
        .subarray(0, length)
        .toString("utf8")
        .replace(/^\uFEFF/, "");
    } finally {
      closeSync(fd);
    }
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      return undefined;
    throw cause;
  }
}

function body(content: string) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();
}

export function projectResources(
  root: string,
  directory = ".",
): ProjectResources {
  const workspace = resolve(root);
  const target = resolve(workspace, directory);
  const relation = relative(workspace, target);
  if (relation === ".." || relation.startsWith(`..${sep}`))
    throw new Error("Context directory must stay in the project");
  const instructions: ProjectResource[] = [];
  const dirs = [workspace];
  for (const part of relation.split(sep).filter(Boolean))
    dirs.push(join(dirs.at(-1) ?? workspace, part));
  for (const dir of dirs) {
    if (!lstatSync(dir).isDirectory())
      throw new Error("Context directory must not be a symlink");
    for (const name of [
      "AGENTS.override.md",
      "AGENTS.md",
      "AGENTS.MD",
      "CLAUDE.md",
      "CLAUDE.MD",
    ]) {
      const content = read(join(dir, name));
      if (content !== undefined) {
        instructions.push({
          name,
          path: relative(workspace, join(dir, name)),
          content,
        });
        break;
      }
    }
  }
  for (const name of ["SYSTEM.md", "APPEND_SYSTEM.md"]) {
    const content = read(join(workspace, ".pi", name));
    if (content !== undefined)
      instructions.push({ name, path: `.pi/${name}`, content });
  }
  const skills: ProjectResources["skills"] = [];
  const prompts: ProjectResources["prompts"] = [];
  const names = new Set<string>();
  let visited = 0;
  function scan(dir: string, kind: "skill" | "prompt", depth = 0) {
    if (depth > 8 || ++visited > 500)
      throw new Error("Project resource discovery limit exceeded");
    let entries: Dirent[];
    try {
      if (!lstatSync(dir).isDirectory()) return;
      entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    } catch (cause) {
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
        return;
      throw cause;
    }
    const skill = kind === "skill" ? read(join(dir, "SKILL.md")) : undefined;
    if (skill !== undefined) {
      const name = basename(dir);
      if (!/^[a-zA-Z0-9_-]+$/.test(name))
        throw new Error(
          "Skill directory names must use letters, numbers, hyphens or underscores",
        );
      if (!names.has(`skill:${name}`)) {
        names.add(`skill:${name}`);
        skills.push({
          name,
          path: relative(workspace, join(dir, "SKILL.md")),
          description: body(skill).slice(0, 300),
        });
      }
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith("."))
        scan(join(dir, entry.name), kind, depth + 1);
      else if (
        kind === "prompt" &&
        entry.isFile() &&
        /^[a-zA-Z0-9_-]+\.md$/.test(entry.name)
      ) {
        const name = entry.name.slice(0, -3);
        const content = read(join(dir, entry.name));
        if (content !== undefined && !names.has(`prompt:${name}`)) {
          names.add(`prompt:${name}`);
          prompts.push({
            name,
            path: relative(workspace, join(dir, entry.name)),
            description: body(content).slice(0, 300),
          });
        }
      }
      if (skills.length + prompts.length > 100)
        throw new Error("Project exceeds 100 resource limit");
    }
  }
  scan(join(workspace, ".pi", "skills"), "skill");
  scan(join(workspace, ".agents", "skills"), "skill");
  scan(join(workspace, ".pi", "prompts"), "prompt");
  const result = { instructions, skills, prompts };
  if (Buffer.byteLength(JSON.stringify(result)) > 131072)
    throw new Error("Project resource index exceeds 128 KiB");
  return result;
}

export function loadProjectResource(
  root: string,
  kind: "skill" | "prompt",
  name: string,
) {
  const index = projectResources(root);
  const resource = (kind === "skill" ? index.skills : index.prompts).find(
    (item) => item.name === name,
  );
  if (!resource) throw new Error("Project resource not found");
  const content = read(join(root, resource.path));
  if (content === undefined)
    throw new Error("Project resource disappeared; reload the index");
  return { ...resource, content: body(content) };
}

export function expandPrompt(template: string, argumentsText: string) {
  const tokens = argumentsText.match(/"(?:\\.|[^"\\])*"|'[^']*'|\S+/g) ?? [];
  const args = tokens.map((value) =>
    value.startsWith('"') && value.endsWith('"')
      ? (JSON.parse(value) as string)
      : value.startsWith("'") && value.endsWith("'")
        ? value.slice(1, -1)
        : value,
  );
  return template.replace(
    /\$\{(@(?::\d+(?::\d+)?)?|\d+)\}|\$(@|\d+)/g,
    (_match, braced: string | undefined, plain: string | undefined) => {
      const key = braced ?? plain ?? "";
      if (key.startsWith("@")) {
        const [, start, count] = key.split(":");
        const offset = Math.max(0, Number(start ?? 1) - 1);
        return args
          .slice(
            offset,
            count === undefined ? undefined : offset + Number(count),
          )
          .join(" ");
      }
      return args[Number(key) - 1] ?? "";
    },
  );
}
