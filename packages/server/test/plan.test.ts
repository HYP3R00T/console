import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import type { Conversation } from "../../web/src/lib/console-api.ts";
import { createApp } from "../src/app.ts";

test("recorded plans persist, fork at historical progress, reject invalid statuses and remain conversation-scoped", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-plan-"));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const options = { dataDirectory: directory, models: () => models };
  let app = createApp({}, options);
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true });
  });
  const headers = { "x-console-request": "1" };
  const created = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: { requestId: "plan" },
    })
  ).json<Conversation>();
  const base = `/v1/sessions/${created.id}`;
  await app.inject({
    method: "PATCH",
    url: `${base}/config`,
    headers,
    payload: { provider: faux.provider.id, model: faux.getModel().id },
  });
  const first = {
    title: "Inspect and verify",
    steps: [
      { step: "Inspect files", status: "in_progress" },
      { step: "Verify result", status: "pending" },
    ],
  };
  const last = {
    title: first.title,
    steps: first.steps.map((step) => ({ ...step, status: "completed" })),
  };
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("update_plan", first), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(fauxToolCall("update_plan", last), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("Verified"),
  ]);
  async function settle(answer: string) {
    for (let n = 0; n < 300; n++) {
      const value = (await app.inject(base)).json<Conversation>();
      if (value.status === "idle" && value.messages.at(-1)?.text === answer)
        return value;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Plan did not settle");
  }
  await app.inject({
    method: "POST",
    url: `${base}/messages`,
    headers,
    payload: { text: "Inspect and verify", requestId: "work" },
  });
  const done = await settle("Verified");
  assert.deepEqual(done.plan?.steps, last.steps);
  const firstResult = done.messages.find(
    (message) => message.toolName === "update_plan",
  );
  assert.ok(firstResult?.entryId);
  assert.ok(firstResult.toolCallId);
  const fork = await app.inject({
    method: "POST",
    url: `${base}/fork`,
    headers,
    payload: { entryId: firstResult.entryId, requestId: "plan-fork" },
  });
  assert.equal(fork.statusCode, 201, fork.body);
  const forkState = (
    await app.inject(`${base}/conversations/${fork.json().id}`)
  ).json<Conversation>();
  assert.deepEqual(forkState.plan?.steps, first.steps);
  const other = (
    await app.inject({
      method: "POST",
      url: `${base}/conversations`,
      headers,
      payload: { requestId: "other" },
    })
  ).json();
  assert.equal(
    (await app.inject(`${base}/conversations/${other.id}`)).json<Conversation>()
      .plan,
    undefined,
  );
  await app.close();
  app = createApp({}, options);
  assert.deepEqual(
    (await app.inject(base)).json<Conversation>().plan?.steps,
    last.steps,
  );
  faux.appendResponses([
    fauxAssistantMessage(
      fauxToolCall("update_plan", {
        title: "Invalid",
        steps: [
          { step: "One", status: "in_progress" },
          { step: "Two", status: "in_progress" },
        ],
      }),
      { stopReason: "toolUse" },
    ),
    (context) => {
      const result = context.messages.at(-1);
      assert.ok(result?.role === "toolResult" && result.isError);
      return fauxAssistantMessage("Invalid plan rejected");
    },
  ]);
  await app.inject({
    method: "POST",
    url: `${base}/messages`,
    headers,
    payload: { text: "Invalid example", requestId: "invalid" },
  });
  const rejected = await settle("Invalid plan rejected");
  assert.deepEqual(rejected.plan?.steps, last.steps);
});
