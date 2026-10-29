import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import type { Conversation } from "../../web/src/lib/api.ts";
import {
  type HistoryPage,
  mergeMessages,
} from "../../web/src/lib/chat/history.ts";
import { createApp } from "../src/app.ts";
import { historyAnswer, seedHistory } from "./fixtures/history.ts";

test("history pages are bounded and stable while new messages arrive, deduplicate with polls and survive restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-history-"));
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses(
    Array.from({ length: 36 }, (_, index) =>
      fauxAssistantMessage(historyAnswer(index)),
    ),
  );
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
      payload: { requestId: "paged" },
    })
  ).json<Conversation>();
  const base = `/v1/sessions/${created.id}`;
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: `${base}/config`,
        headers,
        payload: { provider: faux.provider.id, model: faux.getModel().id },
      })
    ).statusCode,
    200,
  );
  await seedHistory(app, created.id, 0, 35);
  let page = (await app.inject(base)).json<Conversation>();
  assert.ok(page.hasOlder);
  assert.ok(page.messages.length <= 50);
  assert.equal(page.messages.at(-1)?.text, historyAnswer(34));
  let all = page.messages;
  await seedHistory(app, created.id, 35, 1);
  const cursors = new Set<string>();
  while (page.olderCursor) {
    assert.ok(!cursors.has(page.olderCursor));
    cursors.add(page.olderCursor);
    const older = (
      await app.inject(`${base}/history?before=${page.olderCursor}`)
    ).json<HistoryPage>();
    assert.ok(older.messages.length <= 50);
    all = mergeMessages(all, older.messages);
    page = { ...page, ...older, olderCursor: older.olderCursor };
  }
  assert.equal(all.length, 70);
  assert.deepEqual(
    all.filter((item) => item.role === "user").map((item) => item.text),
    Array.from({ length: 35 }, (_, index) => `Question ${index}`),
  );
  const latest = (await app.inject(base)).json<Conversation>();
  all = mergeMessages(all, latest.messages);
  assert.equal(all.length, 72);
  assert.equal(new Set(all.map((item) => item.id)).size, 72);
  assert.equal(all.at(-1)?.text, historyAnswer(35));
  assert.deepEqual(
    (await app.inject(`${base}/conversations/1/history`)).json(),
    (await app.inject(`${base}/history`)).json(),
  );
  for (const before of ["0", "-1", "bad", "9007199254740992"])
    assert.equal(
      (await app.inject(`${base}/history?before=${before}`)).statusCode,
      400,
    );
  assert.deepEqual((await app.inject(`${base}/history?before=1`)).json(), {
    hasOlder: false,
    messages: [],
  });
  await app.close();
  app = createApp({}, options);
  assert.deepEqual(
    (await app.inject(base)).json<Conversation>().messages,
    latest.messages,
  );
  assert.equal(
    (await app.inject(base)).json<Conversation>().olderCursor,
    latest.olderCursor,
  );
});
