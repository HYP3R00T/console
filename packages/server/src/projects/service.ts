import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { ProjectError } from "./errors.ts";
import { inspectGit } from "./git-metadata.ts";
import type { Project, ProjectStore } from "./store.ts";

export { ProjectError } from "./errors.ts";

import { type GitRunner, type Setup, setupProject } from "./setup.ts";
export class ProjectService {
  readonly store: ProjectStore;
  private operations = new Set<AbortController>();
  private tasks = new Set<Promise<unknown>>();
  private closing = false;
  constructor(store: ProjectStore) {
    this.store = store;
  }
  async settings() {
    const projectsRoot = this.store.projectsRoot();
    const unavailableReason = await this.availability(projectsRoot);
    return {
      projectsRoot,
      available: !unavailableReason,
      ...(unavailableReason ? { unavailableReason } : {}),
    };
  }
  async saveSettings(path: string) {
    if (!isAbsolute(path) || path.includes("\0"))
      throw new ProjectError(400, "Enter an absolute projects folder path.");
    let normalized = resolve(path);
    try {
      normalized = await realpath(normalized);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new ProjectError(400, "Projects folder is inaccessible.");
    }
    try {
      if (!(await stat(normalized)).isDirectory())
        throw new ProjectError(400, "Projects folder must be a directory.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.store.setProjectsRoot(normalized);
    return this.settings();
  }
  setup(input: Setup, signal?: AbortSignal, git?: GitRunner) {
    if (this.closing || this.operations.size >= 2)
      throw new ProjectError(
        409,
        "Another project setup is in progress. Try again shortly.",
      );
    const controller = new AbortController();
    this.operations.add(controller);
    const task = setupProject(
      this.store,
      input,
      AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(120000),
        ...(signal ? [signal] : []),
      ]),
      git,
    ).finally(() => {
      this.operations.delete(controller);
      this.tasks.delete(task);
    });
    this.tasks.add(task);
    return task;
  }
  private async availability(path: string) {
    try {
      if (!(await stat(path)).isDirectory()) return "Not a directory.";
      await access(path, constants.R_OK | constants.W_OK | constants.X_OK);
      return undefined;
    } catch {
      return "Directory is missing or inaccessible.";
    }
  }
  private async describe(project: Project) {
    const unavailableReason = await this.availability(project.path);
    return {
      ...project,
      available: !unavailableReason,
      ...(unavailableReason ? { unavailableReason } : {}),
    };
  }
  async list() {
    return {
      projects: await Promise.all(
        this.store.list().map((p) => this.describe(p)),
      ),
    };
  }
  async get(id: string) {
    const project = this.store.get(id);
    if (!project) throw new ProjectError(404, "Project not found.");
    return this.describe(project);
  }
  async gitMetadata(id: string) {
    const project = await this.get(id);
    if (!project.available)
      return {
        status: "unavailable" as const,
        reason: project.unavailableReason,
      };
    return inspectGit(project.path);
  }
  async register(name: string, path: string) {
    name = name.trim();
    if (!name || !isAbsolute(path) || path.includes("\0"))
      throw new ProjectError(
        400,
        "Enter a name and an absolute directory path on this machine.",
      );
    let canonical: string;
    try {
      canonical = await realpath(path);
    } catch {
      throw new ProjectError(400, "Directory is missing or inaccessible.");
    }
    const unavailable = await this.availability(canonical);
    if (unavailable) throw new ProjectError(400, unavailable);
    const project = this.store.insert(name, canonical);
    if (!project)
      throw new ProjectError(409, "This directory is already registered.");
    return this.describe(project);
  }
  async update(id: string, name: string, icon: string, color: string) {
    name = name.trim();
    if (!name || name.length > 120)
      throw new ProjectError(400, "Enter a project name.");
    if (!this.store.update(id, name, icon, color))
      throw new ProjectError(404, "Project not found.");
    return this.get(id);
  }
  remove(id: string) {
    if (!this.store.remove(id))
      throw new ProjectError(404, "Project not found.");
    return { removed: true };
  }
  async close() {
    this.closing = true;
    for (const controller of this.operations) controller.abort();
    await Promise.allSettled([...this.tasks]);
    this.store.close();
  }
}
