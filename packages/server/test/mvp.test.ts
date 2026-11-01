import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { Harness } from "@earendil-works/pi-durable";
import { createApp } from "../src/app.ts";

type Snapshot = {
  id: string;
  projectId: string;
  status: string;
  name: string;
  model?: string;
  messages: { id: string; text: string }[];
  hasOlder: boolean;
  olderCursor?: string;
  partial: string;
  outcome?: string;
};
const headers = { "x-console-request": "1" };
async function until<T>(read: () => Promise<T>, ready: (value: T) => boolean) {
  for (let i = 0; i < 400; i++) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected runtime state did not arrive.");
}
async function fixture(
  t: TestContext,
  options: { slow?: boolean; token?: string } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "console-mvp-"));
  const directory = join(root, "data");
  const path = join(root, "project");
  await mkdir(path);
  const faux = fauxProvider(options.slow ? { tokensPerSecond: 1 } : {});
  const models = createModels();
  models.setProvider(faux.provider);
  const settings = {
    dataDirectory: directory,
    models: () => models,
    providerId: faux.provider.id,
    accessToken: options.token,
  };
  let app = createApp({}, settings);
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  async function request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    payload?: object,
  ) {
    return app.inject({
      method,
      url,
      headers: {
        ...headers,
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      payload,
    });
  }
  const registered = await request("POST", "/v1/projects", {
    name: "Project",
    path,
    requestId: "project",
  });
  assert.equal(registered.statusCode, 201, registered.body);
  const project = registered.json();
  async function create(name = "Work", requestId = name) {
    const response = await request(
      "POST",
      `/v1/projects/${project.id}/sessions`,
      { name, requestId },
    );
    assert.equal(response.statusCode, 201, response.body);
    return response.json<Snapshot>();
  }
  async function configure(id: string) {
    const response = await request("PATCH", `/v1/sessions/${id}/config`, {
      model: faux.getModel().id,
      thinkingLevel: "off",
    });
    assert.equal(response.statusCode, 200, response.body);
  }
  const snapshot = async (id: string) =>
    (await request("GET", `/v1/sessions/${id}`)).json<Snapshot>();
  return {
    root,
    directory,
    path,
    project,
    faux,
    models,
    request,
    create,
    configure,
    snapshot,
    get app() {
      return app;
    },
    async reopen() {
      await app.close();
      app = createApp({}, settings);
    },
  };
}

test("existing-directory registration and independent sessions are idempotent; advanced APIs are absent", async (t) => {
  const f = await fixture(t);
  const first = await f.create();
  const second = await f.create("Second");
  assert.notEqual(first.id, second.id);
  assert.equal((await f.create()).id, first.id);
  assert.equal(
    (
      await f.request("POST", `/v1/projects/${f.project.id}/sessions`, {
        name: "Different",
        requestId: "Work",
      })
    ).statusCode,
    409,
  );
  const invalid = await f.request("POST", "/v1/projects", {
    name: "Missing",
    path: join(f.root, "missing"),
    requestId: "missing",
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(
    (
      await f.request("POST", "/v1/projects", {
        name: "Private",
        path: f.directory,
        requestId: "private",
      })
    ).statusCode,
    400,
  );
  const alias = await f.request("POST", "/v1/projects", {
    name: "Alias",
    path: f.path,
    requestId: "alias",
  });
  assert.equal(alias.json().id, f.project.id);
  for (const url of [
    "/v1/workspaces",
    "/v1/machines",
    "/v1/state",
    `/v1/sessions/${first.id}/conversations`,
    `/v1/sessions/${first.id}/inspect`,
  ])
    assert.equal((await f.request("GET", url)).statusCode, 404, url);
  for (const action of ["fork", "compact", "reset"])
    assert.equal(
      (
        await f.request("POST", `/v1/sessions/${first.id}/${action}`, {
          requestId: "x",
        })
      ).statusCode,
      404,
      action,
    );
  assert.equal(
    (
      await f.request("POST", `/v1/sessions/${first.id}/messages`, {
        text: "hello",
        requestId: "x",
        whenBusy: "steer",
      })
    ).statusCode,
    400,
  );
  await f.reopen();
  assert.equal(
    (await f.request("GET", `/v1/projects/${f.project.id}/sessions`)).json()
      .length,
    2,
  );
});

test("credentials and mutation headers protect APIs; validation and errors remain bounded", async (t) => {
  const f = await fixture(t, { token: "backend-secret" });
  const session = await f.create();
  assert.equal((await f.app.inject("/v1/projects")).statusCode, 401);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: "/v1/projects",
        headers: { authorization: "Bearer backend-secret" },
        payload: {},
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.request("PATCH", `/v1/sessions/${session.id}/config`, {
        model: "unknown",
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await f.request("POST", `/v1/sessions/${session.id}/messages`, {
        text: " ",
        requestId: "blank",
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await f.request("GET", "/v1/sessions/not-an-id")).statusCode,
    400,
  );
  assert.equal(
    (
      await f.request(
        "GET",
        `/v1/sessions/${session.id}/history?before=9999999999999999`,
      )
    ).statusCode,
    400,
  );
  assert.deepEqual((await f.app.inject("/health")).json(), { status: "ok" });
});

test("only one session executes per project; cancellation is scoped and persisted", async (t) => {
  const f = await fixture(t, { slow: true });
  const first = await f.create();
  const second = await f.create("Other");
  await f.configure(first.id);
  await f.configure(second.id);
  assert.equal(
    (
      await f.request("POST", `/v1/sessions/${first.id}/messages`, {
        text: "Rejected mode",
        requestId: "removed-mode",
        whenBusy: "steer",
      })
    ).statusCode,
    400,
  );

  f.faux.setResponses([
    fauxAssistantMessage("An intentionally long unfinished answer"),
  ]);
  assert.equal(
    (
      await f.request("POST", `/v1/sessions/${first.id}/messages`, {
        text: "Start",
        requestId: "start",
      })
    ).statusCode,
    202,
  );
  await until(
    () => f.snapshot(first.id),
    (s) => s.status === "running",
  );
  assert.equal(
    (
      await f.request("POST", `/v1/sessions/${second.id}/messages`, {
        text: "Compete",
        requestId: "second",
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await f.request("DELETE", `/v1/sessions/${first.id}`)).statusCode,
    409,
  );
  assert.equal(
    (
      await f.request("PATCH", `/v1/sessions/${first.id}/config`, {
        model: f.faux.getModel().id,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await f.request("POST", `/v1/sessions/${first.id}/cancel`)).statusCode,
    204,
  );
  assert.equal((await f.snapshot(first.id)).outcome, "aborted");
  const calls = f.faux.state.callCount;
  await f.reopen();
  assert.equal((await f.snapshot(first.id)).status, "idle");
  assert.equal(f.faux.state.callCount, calls);
});

test("reopening never resumes implicitly; another session's cancellation cannot restart it", async (t) => {
  const f = await fixture(t, { slow: true });
  const first = await f.create();
  const second = await f.create("Other");
  await f.configure(first.id);
  await f.configure(second.id);
  f.faux.setResponses([fauxAssistantMessage("A long answer left unfinished")]);
  await f.request("POST", `/v1/sessions/${first.id}/messages`, {
    text: "Start",
    requestId: "start",
  });
  await until(
    () => f.snapshot(first.id),
    (s) => s.status === "running",
  );
  await f.reopen();
  const calls = f.faux.state.callCount;
  assert.equal((await f.snapshot(first.id)).status, "interrupted");
  assert.equal(
    (
      await f.request("POST", `/v1/sessions/${first.id}/messages`, {
        text: "New",
        requestId: "new",
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await f.request("POST", `/v1/sessions/${second.id}/messages`, {
        text: "New",
        requestId: "new",
      })
    ).statusCode,
    409,
  );
  await f.request("POST", `/v1/sessions/${second.id}/cancel`);
  assert.equal(f.faux.state.callCount, calls);
  assert.equal((await f.snapshot(first.id)).status, "interrupted");
  await f.request("POST", `/v1/sessions/${first.id}/resume`);
  await until(
    async () => f.faux.state.callCount,
    (n) => n > calls,
  );
  await f.request("POST", `/v1/sessions/${first.id}/cancel`);
});

test("message retries deduplicate across restart and reject reuse for different input", async (t) => {
  const f = await fixture(t);
  const session = await f.create();
  await f.configure(session.id);
  f.faux.setResponses([fauxAssistantMessage("Answer")]);
  const send = () =>
    f.request("POST", `/v1/sessions/${session.id}/messages`, {
      text: "Question",
      requestId: "question",
    });
  const [first, second] = await Promise.all([send(), send()]);
  assert.equal(first.statusCode, 202);
  assert.deepEqual(first.json(), second.json());
  await until(
    () => f.snapshot(session.id),
    (s) => s.status === "idle" && s.messages.some((m) => m.text === "Answer"),
  );
  const calls = f.faux.state.callCount;
  await f.reopen();
  assert.deepEqual((await send()).json(), first.json());
  assert.equal(f.faux.state.callCount, calls);
  assert.equal(
    (
      await f.request("POST", `/v1/sessions/${session.id}/messages`, {
        text: "Changed",
        requestId: "question",
      })
    ).statusCode,
    409,
  );
});

test("admission and deletion share a boundary, including requests that obtained handles earlier", async (t) => {
  const f = await fixture(t, { slow: true });
  const session = await f.create();
  await f.configure(session.id);
  const original = f.models.checkAuth.bind(f.models);
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const entered = new Promise<void>((resolve) => (reached = resolve));
  t.mock.method(
    f.models,
    "checkAuth",
    async (...args: Parameters<typeof original>) => {
      reached();
      await gate;
      return original(...args);
    },
  );
  f.faux.setResponses([fauxAssistantMessage("Long answer blocks deletion")]);
  const admission = f.request("POST", `/v1/sessions/${session.id}/messages`, {
    text: "Start",
    requestId: "start",
  });
  await entered;
  const deletion = f.request("DELETE", `/v1/sessions/${session.id}`);
  release();
  assert.equal((await admission).statusCode, 202);
  assert.equal((await deletion).statusCode, 409);
  await f.request("POST", `/v1/sessions/${session.id}/cancel`);
  const removed = f.request("DELETE", `/v1/sessions/${session.id}`);
  const late = f.request("POST", `/v1/sessions/${session.id}/messages`, {
    text: "Late",
    requestId: "late",
  });
  assert.equal((await removed).statusCode, 204);
  assert.equal((await late).statusCode, 404);
});

test("native read, write, edit and bash use the project; complete disposal preserves files and credentials", async (t) => {
  const f = await fixture(t);
  const session = await f.create();
  await f.configure(session.id);
  await writeFile(join(f.path, "input.txt"), "marker");
  f.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read", { path: "input.txt" }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(
      fauxToolCall("write", { path: "output.txt", content: "before" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      fauxToolCall("edit", {
        path: "output.txt",
        edits: [{ oldText: "before", newText: "after" }],
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxToolCall("bash", { command: "cat output.txt" }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("Tools completed"),
  ]);
  await f.request("POST", `/v1/sessions/${session.id}/messages`, {
    text: "Exercise tools",
    requestId: "tools",
  });
  const saved = await until(
    () => f.snapshot(session.id),
    (s) =>
      s.status === "idle" &&
      s.messages.some((m) => m.text === "Tools completed"),
  );
  assert.equal(await readFile(join(f.path, "output.txt"), "utf8"), "after");
  assert.ok(saved.messages.some((m) => m.text.includes("marker")));
  const sibling = await f.create("Keep");
  await f.request("DELETE", `/v1/sessions/${session.id}`);
  assert.equal(
    (await f.request("GET", `/v1/sessions/${session.id}`)).statusCode,
    404,
  );
  assert.equal(
    (await f.request("DELETE", `/v1/sessions/${session.id}`)).statusCode,
    204,
  );
  assert.equal(
    (
      await f.request("POST", `/v1/projects/${f.project.id}/sessions`, {
        name: "Work",
        requestId: "Work",
      })
    ).statusCode,
    409,
  );
  assert.equal(await readFile(join(f.path, "output.txt"), "utf8"), "after");
  assert.ok((await readdir(f.directory)).includes("credentials.sqlite"));
  assert.ok(
    !(await readdir(join(f.directory, "mvp", "sessions"))).includes(session.id),
  );
  await f.reopen();
  assert.equal((await f.snapshot(sibling.id)).status, "idle");
});

test("fatal storage failure is visible and explicit Resume can reopen a fresh Harness", async (t) => {
  let storage: Parameters<typeof Harness.open>[0] | undefined;
  const original = Harness.open;
  t.mock.method(
    Harness,
    "open",
    async (...args: Parameters<typeof original>) => {
      storage = args[0];
      return original(...args);
    },
  );
  const f = await fixture(t);
  const session = await f.create();
  await f.configure(session.id);
  assert.ok(storage);
  const broken = storage;
  const commit = broken.commit.bind(broken);
  let fail = true;
  t.mock.method(
    broken,
    "commit",
    async (...args: Parameters<typeof commit>) => {
      if (fail) {
        fail = false;
        throw new Error("secret-provider-payload");
      }
      return commit(...args);
    },
  );
  const result = await f.request("PATCH", `/v1/sessions/${session.id}/config`, {
    model: f.faux.getModel().id,
    instructions: "changed",
  });
  assert.equal(result.statusCode, 500);
  assert.doesNotMatch(result.body, /secret-provider-payload/);
  await until(
    () => f.snapshot(session.id),
    (s) => s.status === "unavailable",
  );
  // Wait for Pi to finish closing storage before the recovery request.
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    (await f.request("POST", `/v1/sessions/${session.id}/resume`)).statusCode,
    204,
  );
  assert.equal((await f.snapshot(session.id)).status, "idle");
});

test("SIGKILL preserves admitted history and requires explicit recovery", {
  timeout: 15000,
}, async (t) => {
  const { spawn } = await import("node:child_process");
  const root = await mkdtemp(join(tmpdir(), "console-mvp-kill-"));
  await mkdir(join(root, "project"));
  const child = spawn(
    process.execPath,
    [new URL("./fixtures/crash-worker.ts", import.meta.url).pathname, root],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let app: ReturnType<typeof createApp> | undefined;
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
    await app?.close();
    await rm(root, { recursive: true, force: true });
  });
  const selected = await new Promise<{ id: string; projectId: string }>(
    (resolve, reject) => {
      let text = "";
      let stderr = "";
      child.stderr.on("data", (part) => (stderr += part));
      child.stdout.on("data", (part) => {
        text += part;
        const end = text.indexOf("\n");
        if (end !== -1) {
          try {
            resolve(JSON.parse(text.slice(0, end)));
          } catch (error) {
            reject(error);
          }
        }
      });
      child.once("error", reject);
      child.once("exit", () =>
        reject(new Error(`Worker exited before ready: ${stderr}`)),
      );
    },
  );
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill("SIGKILL");
  await exited;
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  app = createApp(
    {},
    {
      dataDirectory: join(root, "data"),
      providerId: faux.provider.id,
      models: () => models,
    },
  );
  const initial = (
    await app.inject(`/v1/sessions/${selected.id}`)
  ).json<Snapshot>();
  assert.equal(initial.status, "interrupted");
  assert.ok(initial.messages.some((message) => message.text === "Start"));
  assert.equal(faux.state.callCount, 0);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/v1/sessions/${selected.id}/messages`,
        headers,
        payload: { text: "New", requestId: "new" },
      })
    ).statusCode,
    409,
  );
  await app.inject({
    method: "POST",
    url: `/v1/sessions/${selected.id}/cancel`,
    headers,
  });
  await app.close();
  app = createApp(
    {},
    {
      dataDirectory: join(root, "data"),
      providerId: faux.provider.id,
      models: () => models,
    },
  );
  assert.equal(
    (await app.inject(`/v1/sessions/${selected.id}`)).json<Snapshot>().status,
    "idle",
  );
  assert.equal(faux.state.callCount, 0);
});

test("paginated history retains more than one snapshot window", async (t) => {
  const f = await fixture(t);
  const session = await f.create();
  await f.configure(session.id);
  for (let index = 0; index < 28; index++) {
    f.faux.setResponses([fauxAssistantMessage(`Answer ${index}`)]);
    assert.equal(
      (
        await f.request("POST", `/v1/sessions/${session.id}/messages`, {
          text: `Question ${index}`,
          requestId: `input-${index}`,
        })
      ).statusCode,
      202,
    );
    await until(
      () => f.snapshot(session.id),
      (s) =>
        s.status === "idle" &&
        s.messages.some((m) => m.text === `Answer ${index}`),
    );
  }
  const latest = await f.snapshot(session.id);
  assert.equal(latest.hasOlder, true);
  const older = (
    await f.request(
      "GET",
      `/v1/sessions/${session.id}/history?before=${latest.olderCursor}`,
    )
  ).json<Snapshot>();
  assert.ok(older.messages.some((m) => m.text === "Question 0"));
  assert.ok(
    !older.messages.some((m) => latest.messages.some((n) => n.id === m.id)),
  );
});

test("native shell cancellation prevents a delayed write", async (t) => {
  const f = await fixture(t);
  const session = await f.create();
  await f.configure(session.id);
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("bash", {
        command: "sleep 2; printf unwanted > cancelled.txt",
      }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("Done"),
  ]);
  await f.request("POST", `/v1/sessions/${session.id}/messages`, {
    text: "Run",
    requestId: "shell",
  });
  await until(
    async () => (await f.request("GET", `/v1/sessions/${session.id}`)).json(),
    (s) =>
      s.liveTools?.some(
        (tool: { status: string }) => tool.status === "running",
      ),
  );
  assert.equal(
    (await f.request("POST", `/v1/sessions/${session.id}/cancel`)).statusCode,
    204,
  );
  await new Promise((resolve) => setTimeout(resolve, 2200));
  assert.ok(!(await readdir(f.path)).includes("cancelled.txt"));
});

test("concurrent admissions have one winner per project, while separate projects run independently", async (t) => {
  const f = await fixture(t, { slow: true });
  const first = await f.create();
  const second = await f.create("Second");
  await f.configure(first.id);
  await f.configure(second.id);
  f.faux.setResponses([
    fauxAssistantMessage("A deliberately long answer keeps execution active"),
  ]);
  const results = await Promise.all(
    [first, second].map((session) =>
      f.request("POST", `/v1/sessions/${session.id}/messages`, {
        text: "Start",
        requestId: "start",
      }),
    ),
  );
  assert.deepEqual(
    results.map((result) => result.statusCode).sort(),
    [202, 409],
  );
  const active = results[0].statusCode === 202 ? first : second;
  const otherPath = join(f.root, "other-project");
  await mkdir(otherPath);
  const project = (
    await f.request("POST", "/v1/projects", {
      name: "Other",
      path: otherPath,
      requestId: "other-project",
    })
  ).json();
  const other = (
    await f.request("POST", `/v1/projects/${project.id}/sessions`, {
      name: "Independent",
      requestId: "independent",
    })
  ).json<Snapshot>();
  await f.configure(other.id);
  assert.equal(
    (
      await f.request("POST", `/v1/sessions/${other.id}/messages`, {
        text: "Start",
        requestId: "start",
      })
    ).statusCode,
    202,
  );
  await f.request("POST", `/v1/sessions/${active.id}/cancel`);
  await f.request("POST", `/v1/sessions/${other.id}/cancel`);
});
