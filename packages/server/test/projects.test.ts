import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { publicRepository } from "../src/projects/git.ts";
import { ProjectService } from "../src/projects/service.ts";
import { ProjectStore } from "../src/projects/store.ts";

async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "console-projects-"));
  const root = join(dir, "workspace");
  await mkdir(root);
  const store = new ProjectStore(join(dir, "projects.sqlite"));
  const service = new ProjectService(store);
  const app = createApp({}, undefined, service);
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, root, app, store, service };
}
test("projects register, persist, open and unregister without touching files", async (t) => {
  const { dir, root, app } = await fixture(t);
  const file = join(root, "keep.txt");
  await writeFile(file, "untouched");
  const added = await app.inject({
    method: "POST",
    url: "/v1/projects",
    payload: { name: "  Example  ", path: root },
  });
  assert.equal(added.statusCode, 201);
  const project = added.json();
  assert.equal(project.name, "Example");
  assert.equal(project.available, true);
  assert.equal(added.headers["cache-control"], "no-store");
  const second = new ProjectStore(join(dir, "projects.sqlite"));
  assert.equal(second.get(project.id)?.path, root);
  second.close();
  assert.equal((await stat(join(dir, "projects.sqlite"))).mode & 0o777, 0o600);
  assert.equal((await app.inject("/v1/projects")).json().projects.length, 1);
  assert.equal(
    (await app.inject(`/v1/projects/${project.id}`)).json().name,
    "Example",
  );
  assert.equal(
    (await app.inject({ method: "DELETE", url: `/v1/projects/${project.id}` }))
      .statusCode,
    200,
  );
  assert.equal(await readFile(file, "utf8"), "untouched");
  assert.equal(
    (await app.inject(`/v1/projects/${project.id}`)).statusCode,
    404,
  );
  assert.equal((await app.inject("/v1/projects")).json().projects.length, 0);
});
test("projects validate paths, reject aliases/duplicates, and preserve unavailable registrations", async (t) => {
  const { root, dir, app } = await fixture(t);
  for (const payload of [
    { name: " ", path: root },
    { name: "Bad", path: "relative" },
    { name: "Bad", path: join(dir, "missing") },
    { name: "Bad", path: root, unexpected: true },
  ]) {
    assert.equal(
      (await app.inject({ method: "POST", url: "/v1/projects", payload }))
        .statusCode,
      400,
    );
  }
  const file = join(dir, "file");
  await writeFile(file, "x");
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/projects",
        payload: { name: "File", path: file },
      })
    ).statusCode,
    400,
  );
  const alias = join(dir, "alias");
  await symlink(root, alias);
  const [one, two] = await Promise.all(
    [root, alias].map((path) =>
      app.inject({
        method: "POST",
        url: "/v1/projects",
        payload: { name: "Example", path },
      }),
    ),
  );
  assert.deepEqual([one.statusCode, two.statusCode].sort(), [201, 409]);
  const project = (one.statusCode === 201 ? one : two).json();
  await rename(root, join(dir, "moved"));
  assert.equal(
    (await app.inject(`/v1/projects/${project.id}`)).json().available,
    false,
  );
  assert.equal((await app.inject("/v1/projects")).json().projects.length, 1);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/projects",
        headers: { origin: "https://untrusted.test" },
        payload: { name: "Bad", path: dir },
      })
    ).statusCode,
    403,
  );
});

test("project registration rejects inaccessible directories", async (t) => {
  if (process.getuid?.() === 0 || process.platform === "win32") {
    t.skip("Requires unprivileged POSIX permissions");
    return;
  }
  const { root, app } = await fixture(t);
  await chmod(root, 0o000);
  try {
    const result = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Blocked", path: root },
    });
    assert.equal(result.statusCode, 400);
    assert.equal((await app.inject("/v1/projects")).json().projects.length, 0);
  } finally {
    await chmod(root, 0o700);
  }
});

test("machine projects folder persists without moving registrations; new projects initialize Git", async (t) => {
  const { dir, root, store, app } = await fixture(t);
  const projectsRoot = join(dir, "managed", "projects");
  await app.inject({
    method: "POST",
    url: "/v1/projects",
    payload: { name: "Existing", path: root },
  });
  const saved = await app.inject({
    method: "PUT",
    url: "/v1/machine/settings",
    payload: { projectsRoot },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().projectsRoot, projectsRoot);
  assert.equal(saved.json().available, false);
  assert.equal(
    (await app.inject("/v1/projects")).json().projects[0].path,
    root,
  );
  const persisted = new ProjectStore(join(dir, "projects.sqlite"));
  assert.equal(persisted.projectsRoot(), projectsRoot);
  persisted.close();
  const payload = {
    name: "New project",
    folder: "new-project",
    createParents: false,
  };
  assert.equal(
    (await app.inject({ method: "POST", url: "/v1/projects/create", payload }))
      .statusCode,
    400,
  );
  const created = await app.inject({
    method: "POST",
    url: "/v1/projects/create",
    payload: { ...payload, createParents: true },
  });
  assert.equal(created.statusCode, 201);
  assert.match(
    await readFile(join(projectsRoot, "new-project", ".git", "HEAD"), "utf8"),
    /refs\/heads\/main/,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/v1/projects/create",
        payload: { ...payload, createParents: true },
      })
    ).statusCode,
    409,
  );
  for (const folder of [
    "../escape",
    "/absolute",
    "..",
    ".git",
    "CON",
    "bad.",
  ]) {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/projects/create",
          payload: { ...payload, folder, createParents: true },
        })
      ).statusCode,
      400,
    );
  }
  assert.equal(store.list().length, 2);
});

test("clone publishes isolated staged files and cleans failed/cancelled setups without touching collisions", async (t) => {
  const { root, service, store } = await fixture(t);
  store.setProjectsRoot(root);
  const input = {
    name: "Clone",
    folder: "clone",
    createParents: false,
    repository: "https://example.com/team/repo.git",
  };
  const cloned = await service.setup(input, undefined, async (args, cwd) => {
    assert.equal(args[0], "clone");
    assert.ok(args.includes("--no-recurse-submodules"));
    assert.ok(cwd.startsWith(root));
    const destination = args.at(-1);
    assert.ok(destination);
    await mkdir(destination);
    await writeFile(join(destination, "README.md"), "cloned");
  });
  assert.equal(
    await readFile(join(cloned.path, "README.md"), "utf8"),
    "cloned",
  );
  await assert.rejects(service.setup(input), /already registered/);
  await mkdir(join(root, "occupied"));
  await writeFile(join(root, "occupied", "keep.txt"), "keep");
  await assert.rejects(
    service.setup({ ...input, folder: "occupied" }),
    /already exists/,
  );
  assert.equal(
    await readFile(join(root, "occupied", "keep.txt"), "utf8"),
    "keep",
  );
  await assert.rejects(
    service.setup({ ...input, folder: "failure" }, undefined, async () => {
      throw new Error("fake failure");
    }),
    /fake failure/,
  );
  const controller = new AbortController();
  await assert.rejects(
    service.setup(
      { ...input, folder: "cancelled" },
      controller.signal,
      async () => {
        controller.abort();
      },
    ),
    /abort/i,
  );
  assert.deepEqual((await readdir(root)).sort(), ["clone", "occupied"]);
  assert.equal(store.list().length, 1);
});

test("public clone URLs reject credentials and non-HTTPS transports", () => {
  assert.equal(
    publicRepository("https://github.com/owner/repository.git"),
    "https://github.com/owner/repository.git",
  );
  for (const value of [
    "git@github.com:owner/repo.git",
    "file:///tmp/repo",
    "http://example.com/repo",
    "https://secret@example.com/repo",
    "https://example.com/repo?token=secret",
    "https://example.com/repo#secret",
  ])
    assert.throws(() => publicRepository(value));
});

test("project appearance updates persist without moving files and reject invalid metadata", async (t) => {
  const { app, root, dir } = await fixture(t);
  await writeFile(join(root, "keep.txt"), "unchanged");
  const project = (
    await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Original", path: root },
    })
  ).json();
  const url = `/v1/projects/${project.id}`;
  assert.equal(project.icon, "folder");
  assert.equal(project.color, "neutral");
  const payload = { name: "  Research  ", icon: "cpu", color: "purple" };
  const updated = await app.inject({ method: "PUT", url, payload });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().name, "Research");
  assert.equal(updated.json().path, root);
  assert.equal(updated.json().createdAt, project.createdAt);
  const reopened = new ProjectStore(join(dir, "projects.sqlite"));
  assert.equal(reopened.get(project.id)?.icon, "cpu");
  assert.equal(reopened.get(project.id)?.color, "purple");
  reopened.close();
  assert.equal(await readFile(join(root, "keep.txt"), "utf8"), "unchanged");
  for (const invalid of [
    { ...payload, name: "   " },
    { ...payload, icon: "unknown" },
    { ...payload, color: "unknown" },
    { ...payload, path: "/elsewhere" },
  ]) {
    assert.equal(
      (await app.inject({ method: "PUT", url, payload: invalid })).statusCode,
      400,
    );
  }
  await app.inject({ method: "DELETE", url });
  assert.equal(
    (await app.inject({ method: "PUT", url, payload })).statusCode,
    404,
  );
});

test("existing project registries gain default appearance without losing registrations", async (t) => {
  const { DatabaseSync } = await import("node:sqlite");
  const dir = await mkdtemp(join(tmpdir(), "console-project-migration-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "legacy.sqlite");
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL)",
  );
  db.prepare("INSERT INTO projects VALUES (?,?,?,?)").run(
    "legacy",
    "Legacy",
    dir,
    "2026-01-01",
  );
  db.close();
  const store = new ProjectStore(path);
  t.after(() => store.close());
  assert.deepEqual(
    { ...store.get("legacy") },
    {
      id: "legacy",
      name: "Legacy",
      path: dir,
      createdAt: "2026-01-01",
      icon: "folder",
      color: "neutral",
    },
  );
});

test("Git metadata distinguishes non-repositories, unborn branches, linked worktrees and detached HEAD", async (t) => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { gitEnvironment } = await import("../src/projects/git.ts");
  const { app, root, dir } = await fixture(t);
  const git = (args: string[], cwd = root) =>
    promisify(execFile)(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        ...args,
      ],
      { cwd, env: gitEnvironment() },
    );
  const registered = (
    await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Git fixture", path: root },
    })
  ).json();
  const url = `/v1/projects/${registered.id}/git`;
  assert.deepEqual((await app.inject(url)).json(), {
    status: "not_repository",
  });
  await git(["init", "--initial-branch=main", "--template="]);
  const unborn = (await app.inject(url)).json();
  assert.equal(unborn.status, "repository");
  assert.equal(unborn.currentBranch, "main");
  assert.deepEqual(unborn.branches, []);
  assert.equal(unborn.worktrees.length, 1);
  await git(["commit", "--allow-empty", "-m", "Test fixture"]);
  const linkedPath = join(dir, "linked\nworkspace");
  await git(["worktree", "add", "-b", "feature/example", linkedPath]);
  await git(["worktree", "lock", linkedPath]);
  const before = await readFile(join(root, ".git", "HEAD"), "utf8");
  const response = await app.inject(url);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  const summary = response.json();
  assert.equal(summary.root, root);
  assert.equal(summary.linkedWorktree, false);
  assert.equal(summary.currentBranch, "main");
  assert.deepEqual(summary.branches, ["feature/example", "main"]);
  assert.equal(summary.worktrees.length, 2);
  assert.equal(
    summary.worktrees.find((w: { path: string }) => w.path === linkedPath)
      ?.locked,
    true,
  );
  assert.equal(await readFile(join(root, ".git", "HEAD"), "utf8"), before);
  const linked = (
    await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Linked", path: linkedPath },
    })
  ).json();
  const linkedGit = (await app.inject(`/v1/projects/${linked.id}/git`)).json();
  assert.equal(linkedGit.linkedWorktree, true);
  assert.equal(linkedGit.currentBranch, "feature/example");
  assert.equal(linkedGit.root, linkedPath);
  await git(["checkout", "--detach"]);
  const detached = (await app.inject(url)).json();
  assert.equal(detached.currentBranch, null);
  assert.equal(
    detached.worktrees.find((w: { path: string }) => w.path === root)?.detached,
    true,
  );
  assert.equal(
    (
      await app.inject({
        url,
        headers: { origin: "https://unapproved.example" },
      })
    ).statusCode,
    403,
  );
  await rename(root, join(dir, "moved"));
  const missing = (await app.inject(url)).json();
  assert.equal(missing.status, "unavailable");
  assert.match(missing.reason, /missing or inaccessible/);
  await app.inject({ method: "DELETE", url: `/v1/projects/${registered.id}` });
  assert.equal((await app.inject(url)).statusCode, 404);
});

test("Git metadata identifies bare repositories without inventing a working directory", async (t) => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { gitEnvironment } = await import("../src/projects/git.ts");
  const { root, app } = await fixture(t);
  await promisify(execFile)(
    "git",
    ["init", "--bare", "--initial-branch=main", "--template="],
    { cwd: root, env: gitEnvironment() },
  );
  const project = (
    await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Bare", path: root },
    })
  ).json();
  const summary = (await app.inject(`/v1/projects/${project.id}/git`)).json();
  assert.equal(summary.status, "repository");
  assert.equal(summary.bare, true);
  assert.equal(summary.root, null);
  assert.equal(summary.worktrees[0].bare, true);
});
