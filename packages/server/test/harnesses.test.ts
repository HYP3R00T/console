import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { conversationView } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

const model = { provider: "test", modelId: "test-model" };

test("project -> harness -> one persistent session -> multiple independent conversations", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-harness-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "project");
  mkdirSync(path);
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", path);
  const created = await f.app.inject({
    method: "POST",
    url: `/v1/projects/${project.id}/sessions`,
    payload: {},
  });
  assert.equal(created.statusCode, 201, created.body);
  const harness = created.json();
  assert.notEqual(harness.id, harness.sessionId);
  const base = `/v1/sessions/${harness.sessionId}/conversations`;
  let list = (await f.app.inject(base)).json();
  assert.equal(list.conversations.length, 1);
  assert.equal(list.conversations[0].name, "Main");
  const mainId = list.conversations[0].id;
  const other = await f.app.inject({
    method: "POST",
    url: base,
    payload: {},
  });
  assert.equal(other.statusCode, 201, other.body);
  assert.notEqual(other.json().id, mainId);
  f.faux.setResponses([fauxAssistantMessage("A persistent answer")]);
  const requestId = randomUUID();
  const message = {
    method: "POST" as const,
    url: `${base}/${mainId}/messages`,
    payload: { content: "Hello", requestId, model },
  };
  const admitted = await f.app.inject(message);
  assert.equal(admitted.statusCode, 202, admitted.body);
  const { harness: runtime } = await f.service.session(harness.sessionId);
  await runtime.waitForIdle(context);
  const repeated = await f.app.inject(message);
  assert.equal(repeated.json().id, admitted.json().id);
  assert.equal(f.faux.state.callCount, 1);
  const history = await f.app.inject(`${base}/${mainId}/history`);
  assert.deepEqual(
    history.json().messages.map((m: { text: string }) => m.text),
    ["Hello", "A persistent answer"],
  );
  assert.equal(
    (await f.app.inject(`${base}/${other.json().id}/history`)).json().messages
      .length,
    0,
  );
  const projectUrl = `/v1/projects/${project.id}`;
  assert.equal(
    (await f.app.inject({ method: "DELETE", url: projectUrl })).statusCode,
    200,
  );
  assert.equal((await f.app.inject(base)).statusCode, 404);
  assert.equal((await f.app.inject(message)).statusCode, 404);
  assert.equal(
    statSync(join(directory, "sessions", `${harness.sessionId}.sqlite`)).mode &
      0o777,
    0o600,
  );
  await f.app.close();
  f = await fixture(directory);
  assert.equal((await f.app.inject("/v1/projects")).json().projects.length, 0);
  assert.equal(
    (await f.app.inject("/v1/projects/archive")).json().projects[0].id,
    project.id,
  );
  assert.equal((await f.app.inject(base)).statusCode, 404);
  assert.equal(
    (
      await f.app.inject({ method: "POST", url: `${projectUrl}/restore` })
    ).json().id,
    project.id,
  );
  const reused = await f.service.create(project.id);
  assert.equal(reused.sessionId, harness.sessionId);
  assert.equal(f.service.store.list(project.id).length, 1);
  list = (await f.app.inject(base)).json();
  assert.equal(list.conversations.length, 2);
  assert.ok(
    (await f.app.inject(`${base}/${mainId}/history`)).body.includes(
      "A persistent answer",
    ),
  );
  assert.equal((await f.app.inject(message)).json().id, admitted.json().id);
  assert.equal(f.faux.state.callCount, 0);
  assert.ok(!history.body.includes("secret-not-in-responses"));
});

test("session routes validate scope, models, cursors and browser origins", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-session-validation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", directory);
  const url = `/v1/projects/${project.id}/sessions`;
  for (const payload of [
    { name: " ", model },
    { name: "Test", model, unexpected: true },
    { name: "Test", model: { ...model, modelId: "unknown" } },
  ]) {
    assert.ok(
      [400, 409].includes(
        (await f.app.inject({ method: "POST", url, payload })).statusCode,
      ),
    );
  }
  assert.equal(
    (
      await f.app.inject({
        url,
        headers: { origin: "https://untrusted.example" },
      })
    ).statusCode,
    403,
  );
  const h = (
    await f.app.inject({
      method: "POST",
      url,
      payload: {},
    })
  ).json();
  const base = `/v1/sessions/${h.sessionId}/conversations`;
  const id = (await f.app.inject(base)).json().conversations[0].id;
  assert.equal((await f.app.inject(`${base}/999999/history`)).statusCode, 404);
  assert.equal(
    (await f.app.inject(`${base}/${id}/history?cursor=not-json`)).statusCode,
    400,
  );
  await f.providers.enable("test", false);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `${base}/${id}/messages`,
        payload: { content: "Hi", requestId: randomUUID(), model },
      })
    ).statusCode,
    409,
  );
});

test("SSE detach leaves generation running; reconnect supplies the current snapshot; stop spans the session", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-session-stream-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", directory);
  const h = await f.service.create(project.id);
  const list = await f.service.conversations(h.sessionId);
  const main = list.conversations[0].id;
  const other = await f.service.addConversation(h.sessionId);
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.faux.setResponses([
    async () => {
      await waiting;
      return fauxAssistantMessage("Finished after browser detached");
    },
  ]);
  const url = await f.app.listen({ host: "127.0.0.1", port: 0 });
  const endpoint = `${url}/v1/sessions/${h.sessionId}/conversations/${main}`;
  const response = await fetch(`${endpoint}/events`, {
    headers: { Origin: "http://127.0.0.1:3001" },
  });
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://127.0.0.1:3001",
  );
  assert.ok(response.body);
  const reader = response.body.getReader();
  const initial = new TextDecoder().decode((await reader.read()).value);
  assert.ok(initial.includes("event: snapshot"));
  await f.service.submit(
    h.sessionId,
    String(main),
    "Continue without browser",
    randomUUID(),
    { model },
  );
  const deadline = setTimeout(() => void reader.cancel(), 3000);
  let live = "";
  try {
    while (!live.includes("Continue without browser")) {
      const frame = await reader.read();
      if (frame.done) break;
      live += new TextDecoder().decode(frame.value);
    }
    assert.ok(
      live.includes("Continue without browser"),
      "tagged watch updates reach SSE before generation completes",
    );
  } finally {
    clearTimeout(deadline);
    await reader.cancel();
    release();
  }
  const { harness } = await f.service.session(h.sessionId);
  await harness.waitForIdle(context);
  const reconnected = await fetch(`${endpoint}/events`);
  assert.ok(reconnected.body);
  const next = reconnected.body.getReader();
  assert.ok(
    new TextDecoder()
      .decode((await next.read()).value)
      .includes("Finished after browser detached"),
  );
  await next.cancel();
  const hang = async (
    _context: unknown,
    options: { signal?: AbortSignal } | undefined,
  ) => {
    await new Promise<void>((resolve) => {
      if (options?.signal?.aborted) resolve();
      else
        options?.signal?.addEventListener("abort", () => resolve(), {
          once: true,
        });
    });
    return fauxAssistantMessage("Cancelled", { stopReason: "aborted" });
  };
  f.faux.setResponses([hang, hang]);
  const first = await f.service.submit(
    h.sessionId,
    String(main),
    "One",
    randomUUID(),
  );
  const second = await f.service.submit(
    h.sessionId,
    String(other.id),
    "Two",
    randomUUID(),
    { model },
  );
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: `/v1/sessions/${h.sessionId}/stop`,
        payload: {},
      })
    ).statusCode,
    200,
  );
  for (const admitted of [first, second]) {
    const submission = await harness.submission(admitted.id, context);
    assert.ok(submission);
    const result = await submission.status(context);
    assert.equal(result.status, "unanswered");
  }
  f.faux.setResponses([hang]);
  const active = await f.service.submit(
    h.sessionId,
    String(main),
    "Active",
    randomUUID(),
  );
  const queued = await f.service.submit(
    h.sessionId,
    String(main),
    "Queued",
    randomUUID(),
  );
  const projectUrl = `/v1/projects/${project.id}`;
  const blocked = await f.app.inject({ method: "DELETE", url: projectUrl });
  assert.equal(blocked.statusCode, 409, blocked.body);
  assert.equal(blocked.json().code, "project_busy");
  assert.equal((await f.app.inject(projectUrl)).statusCode, 200);
  const archiving = f.projects.archive(project.id, true);
  await assert.rejects(
    f.service.submit(h.sessionId, String(main), "Race", randomUUID()),
    /archiv/,
  );
  await archiving;
  assert.equal((await f.app.inject(projectUrl)).statusCode, 404);
  assert.equal(
    (await f.app.inject({ method: "POST", url: `${projectUrl}/restore` }))
      .statusCode,
    200,
  );
  const restored = await f.service.session(h.sessionId);
  assert.equal((await restored.harness.inspect(context)).tasks.length, 0);
  for (const admitted of [active, queued]) {
    const submission = await restored.harness.submission(admitted.id, context);
    assert.ok(submission);
    assert.ok(
      ["unanswered", "withdrawn"].includes(
        (await submission.status(context)).status,
      ),
    );
  }
});

test("abrupt process loss releases ownership and recovers an admitted run without duplicate input", {
  timeout: 15000,
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-session-crash-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { spawn } = await import("node:child_process");
  const { EventEmitter } = await import("node:events");
  const once = EventEmitter.once;
  const fixtureUrl = new URL("./support/harness-fixture.ts", import.meta.url)
    .href;
  const source = `import {fixture} from ${JSON.stringify(fixtureUrl)};
    let descriptor;
    const f = await fixture(${JSON.stringify(directory)}, faux => faux.setResponses([async () => {
      process.send(descriptor); await new Promise(() => {});
    }]));
    const project = await f.projects.register('Crash test',${JSON.stringify(directory)});
    const h = await f.service.create(project.id);
    const list = await f.service.conversations(h.sessionId);
    descriptor = {sessionId:h.sessionId,id:list.conversations[0].id,projectId:project.id};
    await f.service.submit(h.sessionId,String(descriptor.id),'Recover this input',${JSON.stringify(randomUUID())},{model:${JSON.stringify(model)}});`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  t.after(() => child.kill("SIGKILL"));
  let errors = "";
  assert.ok(child.stderr);
  child.stderr.on("data", (data) => {
    errors += data;
  });
  const [descriptor] = await Promise.race([
    once(child, "message"),
    once(child, "exit").then(() => {
      throw new Error(`Recovery child exited: ${errors}`);
    }),
  ]);
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  const f = await fixture(directory, (faux) =>
    faux.setResponses([fauxAssistantMessage("Recovered answer")]),
  );
  t.after(() => f.app.close());
  const { harness } = await f.service.session(descriptor.sessionId);
  await harness.waitForIdle(context);
  const history = await f.service.history(
    descriptor.sessionId,
    String(descriptor.id),
  );
  assert.equal(
    history.items.filter((entry) => entry.kind === "pi.user").length,
    1,
  );
  assert.ok(JSON.stringify(history.items).includes("Recovered answer"));
  assert.equal(f.faux.state.callCount, 1);
});

test("single-flight runtime ownership, interrupted root initialization and history pagination", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-session-ownership-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", directory);
  // Simulate index publication followed by process loss before root creation.
  const indexed = f.service.store.insert(
    project.id,
    model.provider,
    model.modelId,
  );
  await f.app.close();
  f = await fixture(directory);
  const list = await f.service.conversations(indexed.sessionId);
  assert.equal(list.conversations[0].name, "Main");
  const [one, two] = await Promise.all([
    f.service.runtime.open(indexed.sessionId),
    f.service.runtime.open(indexed.sessionId),
  ]);
  assert.equal(one, two);
  const { HarnessRuntime } = await import("../src/harnesses/runtime.ts");
  const competing = new HarnessRuntime(
    join(directory, "sessions"),
    f.providers,
  );
  await assert.rejects(competing.claim(), /locked/);
  await competing.close();
  const root = await one.root(context);
  for (let index = 0; index < 65; index++)
    await root.submit(
      {
        type: "write",
        entry: {
          kind: "console.test",
          model: [
            { role: "user", content: `Entry ${index}`, timestamp: index },
          ],
        },
      },
      context,
    );
  const base = `/v1/sessions/${indexed.sessionId}/conversations/${root.id}/history`;
  const first = (await f.app.inject(base)).json();
  assert.equal(first.messages.length, 50);
  assert.ok(first.next);
  const second = (
    await f.app.inject(`${base}?cursor=${encodeURIComponent(first.next)}`)
  ).json();
  assert.equal(second.messages.length, 15);
  assert.equal(second.next, undefined);
  const ids = [...first.messages, ...second.messages].map(
    (message: { id: string }) => message.id,
  );
  assert.equal(new Set(ids).size, 65);
});

test("failed input has an explicit completion status without leaking provider diagnostics", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-session-failure-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", directory);
  const h = await f.service.create(project.id);
  const { harness } = await f.service.session(h.sessionId);
  const root = await harness.root(context);
  const diagnostic = "private-provider-diagnostic-must-not-leak";
  const failure = fauxAssistantMessage("", {
    stopReason: "error",
    errorMessage: diagnostic,
  });
  f.faux.setResponses([failure, failure]);
  const submitted = await f.service.submit(
    h.sessionId,
    String(root.id),
    "Hello",
    randomUUID(),
    { model },
  );
  await harness.waitForIdle(context);
  const base = `/v1/sessions/${h.sessionId}/conversations/${root.id}`;
  for (const url of [
    `${base}/submissions`,
    `${base}/submissions/${submitted.id}`,
  ]) {
    const response = await f.app.inject(url);
    assert.equal(response.statusCode, 200);
    assert.ok(!response.body.includes(diagnostic));
    const result = response.json().latest ?? response.json();
    assert.equal(result.status, "unanswered");
    assert.equal(result.detail, undefined);
    assert.equal(result.trace, undefined);
  }
});

test("projects reuse one harness without providers; concurrent requests create independent conversations", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-default-session-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  await f.providers.enable("test", false);
  const project = await f.projects.register("Default project", directory);
  const initial = (
    await f.app.inject(`/v1/projects/${project.id}/sessions`)
  ).json().sessions;
  assert.deepEqual(
    initial.map((session: { number: number; name: string }) => [
      session.number,
      session.name,
    ]),
    [[1, "Session 1"]],
  );
  assert.equal(
    (await f.service.conversations(initial[0].sessionId)).conversations[0].name,
    "Main",
  );
  const responses = await Promise.all(
    [0, 1, 2].map(() =>
      f.app.inject({
        method: "POST",
        url: `/v1/projects/${project.id}/sessions`,
        payload: {},
      }),
    ),
  );
  assert.ok(responses.every((response) => response.statusCode === 201));
  assert.deepEqual(
    responses.map((response) => response.json().sessionId),
    Array(3).fill(initial[0].sessionId),
  );
  assert.equal(f.service.store.list(project.id).length, 1);
  const runtime = (await f.service.session(initial[0].sessionId)).harness;
  for (const response of responses)
    assert.equal(
      (await f.service.session(response.json().sessionId)).harness,
      runtime,
    );
  const chats = await Promise.all([
    f.service.addConversation(initial[0].sessionId),
    f.service.addConversation(initial[0].sessionId),
  ]);
  assert.deepEqual(
    chats.map((chat) => chat.name),
    ["Conversation 2", "Conversation 3"],
  );
  assert.equal(f.faux.state.callCount, 0);
});

test("model and thinking selection is validated before admission, persisted, and deduplicated on retry", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-message-model-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", directory);
  const session = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  const url = `/v1/sessions/${session.sessionId}/conversations/${root.id}/messages`;
  const requestId = randomUUID();
  const invalid = await f.app.inject({
    method: "POST",
    url,
    payload: { content: "Hello", requestId, model, thinkingLevel: "invented" },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(
    (await f.service.history(session.sessionId, String(root.id))).items.length,
    0,
  );
  f.faux.setResponses([fauxAssistantMessage("Model configured")]);
  const levels = (await f.providers.favorites()).models.find(
    (item) => item.id === model.modelId,
  )?.thinkingLevels;
  assert.ok(levels);
  const thinkingLevel = levels[0];
  const admitted = await f.app.inject({
    method: "POST",
    url,
    payload: {
      content: "Hello",
      requestId,
      model,
      ...(thinkingLevel ? { thinkingLevel } : {}),
    },
  });
  assert.equal(admitted.statusCode, 202, admitted.body);
  await harness.waitForIdle(context);
  assert.deepEqual((await root.agent(context)).model, model);
  if (thinkingLevel)
    assert.equal((await root.agent(context)).thinkingLevel, thinkingLevel);
  const repeated = await f.app.inject({
    method: "POST",
    url,
    payload: { content: "Hello", requestId, model, thinkingLevel: "invented" },
  });
  assert.equal(repeated.statusCode, 202);
  assert.equal(repeated.json().id, admitted.json().id);
  assert.equal(f.faux.state.callCount, 1);
});

test("session numbering migration preserves existing session identities", async (t) => {
  const directory = mkdtempSync(
    join(tmpdir(), "console-session-number-migration-"),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { openDatabase } = await import("../src/storage/database.ts");
  const { HarnessStore } = await import("../src/harnesses/store.ts");
  const file = join(directory, "legacy.sqlite");
  const legacy = openDatabase(file);
  legacy.exec(
    "CREATE TABLE harnesses (id TEXT PRIMARY KEY,sessionId TEXT NOT NULL UNIQUE,projectId TEXT NOT NULL,name TEXT NOT NULL,createdAt TEXT NOT NULL,provider TEXT NOT NULL,modelId TEXT NOT NULL)",
  );
  const ids = [randomUUID(), randomUUID()];
  const sessionIds = [randomUUID(), randomUUID()];
  for (let index = 0; index < 2; index++)
    legacy
      .prepare("INSERT INTO harnesses VALUES (?,?,?,?,?,?,?)")
      .run(
        ids[index],
        sessionIds[index],
        "project",
        `Old harness ${index}`,
        `2026-11-0${index + 1}`,
        "test",
        "test-model",
      );
  legacy.close();
  const store = new HarnessStore(file);
  t.after(() => store.close());
  assert.deepEqual(
    store.list("project").map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      name: row.name,
      number: row.number,
    })),
    ids.map((id, index) => ({
      id,
      sessionId: sessionIds[index],
      name: `Session ${index + 1}`,
      number: index + 1,
    })),
  );
  assert.equal(store.insert("project").sessionId, sessionIds[0]);
  assert.equal(store.list("project").length, 2);
});

test("switching models clears unsupported thinking preferences", async (t) => {
  const directory = mkdtempSync(
    join(tmpdir(), "console-thinking-model-switch-"),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", directory);
  const session = (await f.service.list(project.id)).sessions[0];
  const { harness } = await f.service.session(session.sessionId);
  const root = await harness.root(context);
  f.faux.setResponses([
    fauxAssistantMessage("Reasoned"),
    fauxAssistantMessage("Plain"),
  ]);
  const reasoning = { provider: "test", modelId: "reasoning-model" };
  await f.service.submit(
    session.sessionId,
    String(root.id),
    "First",
    randomUUID(),
    { model: reasoning, thinkingLevel: "high" },
  );
  await harness.waitForIdle(context);
  assert.equal((await root.agent(context)).thinkingLevel, "high");
  await assert.rejects(
    f.service.submit(
      session.sessionId,
      String(root.id),
      "Invalid",
      randomUUID(),
      { model, thinkingLevel: "high" },
    ),
    /unavailable/,
  );
  await f.service.submit(
    session.sessionId,
    String(root.id),
    "Second",
    randomUUID(),
    { model },
  );
  await harness.waitForIdle(context);
  assert.deepEqual((await root.agent(context)).model, model);
  assert.equal((await root.agent(context)).thinkingLevel, "off");
  assert.equal(f.faux.state.callCount, 2);
});

test("standalone chats stay separate from projects and retain workspaces and transcripts on restart", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-standalone-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", directory);
  const projectSession = f.service.store.list(project.id)[0];
  const create = () =>
    f.app.inject({ method: "POST", url: "/v1/standalone", payload: {} });
  const one = await create();
  const two = await create();
  assert.equal(one.statusCode, 201, one.body);
  assert.equal(two.statusCode, 201, two.body);
  const first = one.json();
  const second = two.json();
  assert.equal(first.name, "Conversation 1");
  assert.equal(second.name, "Conversation 2");
  const detail = `/v1/standalone/${first.sessionId}`;
  const id = (await f.app.inject(detail)).json().conversationId;
  const conversations = `/v1/sessions/${first.sessionId}/conversations`;
  const chat = `${conversations}/${id}`;
  assert.equal(
    (await f.app.inject(`/v1/standalone/${projectSession.sessionId}`))
      .statusCode,
    404,
  );
  assert.equal(
    (await f.app.inject({ method: "POST", url: conversations, payload: {} }))
      .statusCode,
    409,
  );
  assert.deepEqual(
    (await f.app.inject(`/v1/projects/${project.id}/sessions`)).json().sessions,
    [{ ...projectSession }],
  );
  assert.deepEqual(
    (await f.app.inject("/v1/standalone"))
      .json()
      .sessions.map((item: { sessionId: string }) => item.sessionId),
    [second.sessionId, first.sessionId],
  );

  const { conversation, harness } = await f.service.conversation(
    first.sessionId,
    String(id),
  );
  const workspace = join(directory, "sessions", "workspaces", first.sessionId);
  assert.equal((await conversation.agent(context)).cwd, workspace);
  assert.equal(statSync(workspace).mode & 0o777, 0o700);
  const { writeFileSync, readFileSync } = await import("node:fs");
  writeFileSync(join(workspace, "keep.txt"), "persistent workspace");
  f.faux.setResponses([fauxAssistantMessage("Standalone answer")]);
  const message = await f.app.inject({
    method: "POST",
    url: `${chat}/messages`,
    payload: { model, requestId: randomUUID(), content: "Hello" },
  });
  assert.equal(message.statusCode, 202, message.body);
  await harness.waitForIdle(context);
  await f.app.close();
  f = await fixture(directory);
  assert.equal((await f.app.inject(detail)).json().conversationId, id);
  assert.match(
    (await f.app.inject(`${chat}/history`)).body,
    /Standalone answer/,
  );
  assert.equal(
    readFileSync(join(workspace, "keep.txt"), "utf8"),
    "persistent workspace",
  );
  assert.equal(f.faux.state.callCount, 0);
});

test("submitted thinking levels survive view recreation and restart independently per conversation", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-saved-thinking-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", directory);
  const sessionId = f.service.store.list(project.id)[0].sessionId;
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const sibling = await f.service.addConversation(sessionId);
  const reasoning = { provider: "test", modelId: "reasoning-model" };
  const submit = async (id: number, thinkingLevel?: string) => {
    f.faux.setResponses([fauxAssistantMessage("Done")]);
    await f.service.submit(sessionId, String(id), "Hello", randomUUID(), {
      model: reasoning,
      ...(thinkingLevel ? { thinkingLevel } : {}),
    });
    await harness.waitForIdle(context);
  };
  const read = async (id: number) => {
    const scope = await f.service.conversation(sessionId, String(id));
    const watch = await scope.conversation.watch(context);
    try {
      return conversationView(watch.value).thinkingLevel;
    } finally {
      await watch.stop();
    }
  };
  await submit(root.id, "high");
  await submit(sibling.id, "low");
  assert.equal(await read(root.id), "high");
  assert.equal(await read(sibling.id), "low");
  await submit(root.id);
  assert.equal(await read(root.id), "high");
  await submit(root.id, "low");
  assert.equal(await read(root.id), "low");
  await f.app.close();
  f = await fixture(directory);
  assert.equal(await read(root.id), "low");
  assert.equal(await read(sibling.id), "low");
});

test("project conversations remain discoverable beyond 200 without opening another harness", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-many-conversations-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Many conversations", directory);
  const session = await f.service.create(project.id);
  const { harness } = await f.service.session(session.sessionId);
  const ids: number[] = [];
  for (let index = 0; index < 205; index++)
    ids.push((await f.service.addConversation(session.sessionId)).id);
  const list = await f.app.inject(
    `/v1/sessions/${session.sessionId}/conversations`,
  );
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json().conversations.length, 206);
  assert.equal(list.json().more, false);
  assert.ok(
    list
      .json()
      .conversations.some((chat: { id: number }) => chat.id === ids.at(-1)),
  );
  assert.equal(f.service.store.list(project.id).length, 1);
  assert.equal((await f.service.session(session.sessionId)).harness, harness);
});
