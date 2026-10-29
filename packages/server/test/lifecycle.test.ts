import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { createApp } from "../src/app.ts";
import { openMachineSettings } from "../src/platform/machine-settings.ts";
import { openWorkspaces } from "../src/projects/workspaces.ts";

const headers = { "x-console-request": "1" };
async function until<T>(read: () => Promise<T>, ready: (value: T) => boolean) {
  for (let n = 0; n < 200; n++) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((accept) => setTimeout(accept, 10));
  }
  throw new Error("Expected lifecycle state did not arrive");
}

test("machine settings and remembered project models persist; deletion is recoverable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "console-lifecycle-"));
  const directory = join(root, "private");
  const faux = fauxProvider({ models: [{ id: "a" }, { id: "b" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  let app = createApp(
    {},
    { dataDirectory: directory, machineName: "Fixture", models: () => models },
  );
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true });
  });
  const defaults = {
    provider: faux.provider.id,
    model: "a",
    thinkingLevel: "off",
  };
  const saved = await app.inject({
    method: "PATCH",
    url: "/v1/machine-settings",
    headers,
    payload: {
      name: "Work laptop",
      projectsDirectory: join(root, "projects"),
      defaultConfiguration: defaults,
    },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(
    (await app.inject("/v1/machines")).json()[0].name,
    "Work laptop",
  );
  const project = (
    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers,
      payload: { name: "Demo", createDirectory: true, requestId: "demo" },
    })
  ).json();
  assert.equal(project.path, join(root, "projects/Demo"));
  await writeFile(join(project.path, "keep.txt"), "keep");
  const created = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    headers,
    payload: {
      name: "Setup",
      workspaceId: project.id,
      requestId: "setup",
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id;
  const base = `/v1/sessions/${id}`;
  assert.equal(created.json().model.modelId, "a");
  assert.equal(created.json().workspace, project.path);
  await writeFile(
    join(project.path, "package.json"),
    JSON.stringify({ name: "setup-fixture", private: true, version: "0.0.0" }),
  );
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("bash", {
        command:
          "pnpm install --offline --ignore-scripts && printf ready > built.txt",
      }),
      { stopReason: "toolUse" },
    ),
    (context) => {
      const result = context.messages.at(-1);
      assert.ok(result?.role === "toolResult" && !result.isError);
      return fauxAssistantMessage("Setup verified");
    },
  ]);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${base}/messages`,
        headers,
        payload: { text: "Set up the project", requestId: "setup-project" },
      })
    ).statusCode,
    202,
  );
  await until(
    async () => (await app.inject(base)).json(),
    (value) =>
      value.status === "idle" &&
      value.messages.at(-1)?.text === "Setup verified",
  );
  assert.equal(
    await readFile(join(project.path, "built.txt"), "utf8"),
    "ready",
  );

  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${base}/config`,
        headers,
        payload: { ...defaults, model: "b" },
      })
    ).statusCode,
    200,
  );
  const next = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: { name: "Next", workspaceId: project.id, requestId: "next" },
    })
  ).json();
  assert.equal(next.model.modelId, "b");
  const child = (
    await app.inject({
      method: "POST",
      url: `${base}/conversations`,
      headers,
      payload: { name: "Review", requestId: "review" },
    })
  ).json();
  const childPath = `${base}/conversations/${child.id}`;
  assert.equal(
    (await app.inject({ method: "DELETE", url: childPath, headers }))
      .statusCode,
    204,
  );
  assert.equal((await app.inject(childPath)).statusCode, 404);
  assert.equal(
    (await app.inject(`${base}/conversations/trash`)).json()[0].id,
    child.id,
  );
  assert.equal(
    (await app.inject({ method: "POST", url: `${childPath}/restore`, headers }))
      .statusCode,
    200,
  );
  assert.equal((await app.inject(childPath)).json().model.modelId, "b");
  assert.equal(
    (await app.inject({ method: "DELETE", url: base, headers })).statusCode,
    204,
  );
  assert.equal((await app.inject(base)).statusCode, 404);
  assert.equal((await app.inject("/v1/sessions/trash")).json()[0].id, id);
  assert.equal(
    (await app.inject({ method: "POST", url: `${base}/restore`, headers }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: `/v1/workspaces/${project.id}`,
        headers,
      })
    ).statusCode,
    204,
  );
  assert.equal((await app.inject("/v1/sessions")).json().length, 0);
  assert.equal(await readFile(join(project.path, "keep.txt"), "utf8"), "keep");
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/v1/workspaces/${project.id}/restore`,
        headers,
      })
    ).statusCode,
    200,
  );
  assert.equal((await app.inject("/v1/sessions")).json().length, 2);
  await app.close();
  app = createApp({}, { dataDirectory: directory, models: () => models });
  const restored = (await app.inject("/v1/machine-settings")).json();
  assert.equal(restored.name, "Work laptop");
  assert.equal(restored.lastConfiguration.model, "b");
  assert.equal(restored.defaultConfiguration.model, "a");
  const plain = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: { name: "No project", requestId: "plain" },
    })
  ).json();
  assert.equal(plain.model.modelId, "a");
});

test("cloning is asynchronous, retries safely, and uses the machine project root", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "console-clone-"));
  const privateDirectory = join(root, "private");
  await mkdir(privateDirectory);
  const settings = openMachineSettings(privateDirectory, "Clone machine");
  settings.save({
    ...settings.get(),
    projectsDirectory: join(root, "projects"),
  });
  let attempt = 0;
  const workspaces = openWorkspaces(
    privateDirectory,
    settings,
    async (_url, target) => {
      ++attempt;
      if (attempt === 1) throw new Error("Connection interrupted");
      await mkdir(target);
      await writeFile(join(target, "README.md"), "cloned");
    },
  );
  t.after(async () => {
    await workspaces.close();
    settings.close();
    await rm(root, { recursive: true });
  });
  const created = await workspaces.create({
    name: "Library",
    repository: "https://github.com/example/library",
    requestId: "library",
  });
  assert.equal(created.state, "cloning");
  await until(
    async () => workspaces.get(created.id),
    (row) => row.state === "failed",
  );
  workspaces.retry(created.id);
  const ready = await until(
    async () => workspaces.get(created.id),
    (row) => row.state === "ready",
  );
  assert.equal(ready.path, join(root, "projects/library"));
  assert.equal(await readFile(join(ready.path, "README.md"), "utf8"), "cloned");
  assert.equal(
    (
      await workspaces.create({
        name: "Library",
        repository: "https://github.com/example/library",
        requestId: "library",
      })
    ).id,
    created.id,
  );
  await assert.rejects(
    workspaces.create({
      name: "Bad",
      repository: "https://token@github.com/example/library",
      requestId: "bad",
    }),
  );
});
