import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  type FauxResponseFactory,
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { conversationView } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

function held(response = fauxAssistantMessage("Finished")) {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const run: FauxResponseFactory = async (_transcript, options) => {
    entered();
    await Promise.race([
      gate,
      new Promise<void>((resolve) => {
        if (options?.signal?.aborted) resolve();
        else
          options?.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
      }),
    ]);
    return options?.signal?.aborted
      ? fauxAssistantMessage("Stopped", { stopReason: "aborted" })
      : response;
  };
  return { run, started, release };
}
async function setup(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "console-queue-controls-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("Project", directory);
  const sessionId = f.service.store.list(project.id)[0].sessionId;
  const { harness } = await f.service.session(sessionId);
  const root = await harness.root(context);
  const base = `/v1/sessions/${sessionId}/conversations/${root.id}`;
  const submit = (content: string, extra = {}) =>
    f.app.inject({
      method: "POST",
      url: `${base}/messages`,
      payload: {
        content,
        requestId: randomUUID(),
        model: { provider: "test", modelId: "test-model" },
        ...extra,
      },
    });
  return { ...f, directory, sessionId, harness, root, base, submit };
}

test("queued inputs can be edited, withdrawn and promoted to steering without rewriting history", async (t) => {
  const f = await setup(t);
  const hold = held(
    fauxAssistantMessage([fauxToolCall("bash", { command: "pwd" })], {
      stopReason: "toolUse",
    }),
  );
  const seen: string[] = [];
  const capture: FauxResponseFactory = (transcript) => {
    seen.push(JSON.stringify(transcript.messages));
    return fauxAssistantMessage("Done");
  };
  f.faux.setResponses([hold.run, capture, capture]);
  assert.equal((await f.submit("Start")).statusCode, 202);
  await hold.started;
  const remove = (await f.submit("Remove this")).json();
  const follow = (
    await f.submit("Follow", {
      attachments: [
        {
          name: "note.txt",
          mimeType: "text/plain",
          data: Buffer.from("evidence").toString("base64"),
        },
      ],
    })
  ).json();
  const steer = (await f.submit("Old steer")).json();
  const queue = (await f.app.inject(`${f.base}/queue`)).json().items;
  assert.equal(queue.length, 3);
  const change = {
    content: "Edited steer",
    whenBusy: "steer",
    expectedContent: "Old steer",
    expectedWhenBusy: "followUp",
  };
  const edit = await f.app.inject({
    method: "PATCH",
    url: `${f.base}/queue/${steer.id}`,
    payload: change,
  });
  assert.equal(edit.statusCode, 200, edit.body);
  assert.equal(
    (
      await f.app.inject({
        method: "PATCH",
        url: `${f.base}/queue/${steer.id}`,
        payload: change,
      })
    ).statusCode,
    409,
  );
  const editAttached = await f.app.inject({
    method: "PATCH",
    url: `${f.base}/queue/${follow.id}`,
    payload: {
      content: "Edited follow",
      whenBusy: "followUp",
      expectedContent: "Follow",
      expectedWhenBusy: "followUp",
    },
  });
  assert.equal(editAttached.statusCode, 200, editAttached.body);
  const sibling = await f.service.addConversation(f.sessionId);
  assert.equal(
    (
      await f.app.inject({
        method: "DELETE",
        url: `/v1/sessions/${f.sessionId}/conversations/${sibling.id}/queue/${remove.id}`,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "DELETE",
        url: `${f.base}/queue/${remove.id}`,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "DELETE",
        url: `${f.base}/queue/${remove.id}`,
      })
    ).statusCode,
    200,
  );
  const watch = await f.root.watch(context);
  const projected = conversationView(watch.value);
  await watch.stop();
  assert.equal(projected.queue.length, 2);
  assert.equal(projected.queue[0].attachments[0].name, "note.txt");
  assert.ok(
    !JSON.stringify(projected.queue).includes(
      Buffer.from("evidence").toString("base64"),
    ),
  );
  hold.release();
  await f.harness.waitForIdle(context);
  assert.ok(seen[0].includes("Edited steer"));
  assert.ok(!seen[0].includes("Edited follow"));
  assert.ok(seen[1].includes("Edited follow"));
  assert.ok(seen[1].includes("evidence"));
  assert.ok(!seen.join("").includes("Remove this"));
  assert.equal(
    (
      await f.app.inject({
        method: "PATCH",
        url: `${f.base}/queue/${steer.id}`,
        payload: change,
      })
    ).statusCode,
    409,
  );
  assert.equal((await f.app.inject(`${f.base}/queue`)).json().items.length, 0);
});

test("conversation stop interrupts its run and queue while sibling work continues", async (t) => {
  const f = await setup(t);
  const a = held();
  const b = held();
  f.faux.setResponses([a.run, b.run]);
  const active = (await f.submit("Start")).json();
  await a.started;
  const queued = (await f.submit("Next")).json();
  const sibling = await f.service.addConversation(f.sessionId);
  const other = await f.service.submit(
    f.sessionId,
    String(sibling.id),
    "Other",
    randomUUID(),
    { model: { provider: "test", modelId: "test-model" } },
  );
  await b.started;
  const stop = await f.app.inject({
    method: "POST",
    url: `${f.base}/stop`,
    payload: {},
  });
  assert.equal(stop.statusCode, 200, stop.body);
  for (const id of [active.id, queued.id]) {
    const status = await f.service.submission(
      f.sessionId,
      String(f.root.id),
      String(id),
    );
    assert.equal(status.status, "unanswered");
  }
  const status = await f.service.submission(
    f.sessionId,
    String(sibling.id),
    String(other.id),
  );
  assert.equal(status.status, "placed");
  b.release();
  await f.harness.waitForIdle(context);
});

test("direct steering and queue route validation use the same durable admission", async (t) => {
  const f = await setup(t);
  const hold = held();
  f.faux.setResponses([hold.run, fauxAssistantMessage("Steered")]);
  await f.submit("Start");
  await hold.started;
  const requestId = randomUUID();
  const steer = await f.submit("Direction", { requestId, whenBusy: "steer" });
  assert.equal(steer.statusCode, 202);
  assert.equal(
    (await f.submit("Direction", { requestId, whenBusy: "steer" })).json().id,
    steer.json().id,
  );
  assert.equal(
    (await f.app.inject(`${f.base}/queue`)).json().items[0].whenBusy,
    "steer",
  );
  assert.equal(
    (await f.submit("Invalid", { whenBusy: "invented" })).statusCode,
    400,
  );
  const invalidOrigin = await f.app.inject({
    method: "POST",
    url: `${f.base}/stop`,
    headers: { origin: "https://untrusted.example" },
    payload: {},
  });
  assert.equal(invalidOrigin.statusCode, 403);
  assert.equal(
    (
      await f.submit("Model switch", {
        model: { provider: "test", modelId: "reasoning-model" },
      })
    ).statusCode,
    409,
  );
  hold.release();
  await f.harness.waitForIdle(context);
});
