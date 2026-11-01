import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { join } from "node:path";
import { ProjectError } from "./errors.ts";
import { publicRepository, runGit } from "./git.ts";
import type { ProjectStore } from "./store.ts";

export type Setup = {
  name: string;
  folder: string;
  createParents: boolean;
  repository?: string;
};
export type GitRunner = typeof runGit;
export async function setupProject(
  store: ProjectStore,
  input: Setup,
  signal: AbortSignal,
  git: GitRunner = runGit,
) {
  const name = input.name.trim();
  if (
    !name ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(input.folder) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(input.folder) ||
    input.folder.endsWith(".")
  )
    throw new ProjectError(
      400,
      "Use a folder name with letters, numbers, dots, underscores or hyphens.",
    );
  const repository =
    input.repository === undefined
      ? undefined
      : publicRepository(input.repository);
  const configured = store.projectsRoot();
  if (input.createParents) {
    try {
      await mkdir(configured, { recursive: true });
    } catch {
      throw new ProjectError(
        400,
        "Could not create the projects folder. Check its path and permissions.",
      );
    }
  }
  let root: string;
  try {
    root = await realpath(configured);
    await access(root, constants.R_OK | constants.W_OK | constants.X_OK);
  } catch {
    throw new ProjectError(
      400,
      "Projects folder is missing or inaccessible. Enable Create missing parent folders or update machine settings.",
    );
  }
  const destination = join(root, input.folder);
  if (store.byPath(destination))
    throw new ProjectError(409, "This directory is already registered.");
  try {
    await lstat(destination);
    throw new ProjectError(
      409,
      "Destination already exists. Choose another folder name or add it as an existing project.",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const staging = await mkdtemp(join(root, ".console-setup-"));
  const work = join(staging, "project");
  try {
    signal.throwIfAborted();
    if (repository)
      await git(
        [
          "clone",
          "--no-recurse-submodules",
          "--template=",
          "--",
          repository,
          work,
        ],
        staging,
        signal,
      );
    else {
      await mkdir(work);
      await git(
        ["init", "--template=", "--initial-branch=main", "--", work],
        staging,
        signal,
      );
    }
    signal.throwIfAborted();
    // Reserve the name atomically; rename may replace only our empty reservation.
    try {
      await mkdir(destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new ProjectError(
          409,
          "Destination already exists. Choose another folder name.",
        );
      throw error;
    }
    try {
      await rename(work, destination);
    } catch (error) {
      await rmdir(destination).catch(() => {});
      throw error;
    }
    // Published files are never recursively deleted, even if registration fails.
    const project = store.insert(name, destination);
    if (!project)
      throw new ProjectError(
        409,
        "Files are ready. Add the destination as an existing project.",
      );
    return { ...project, available: true };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
