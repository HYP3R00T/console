import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import sharp from "sharp";
import { messages } from "../src/harnesses/view.ts";
import { fixture } from "./support/harness-fixture.ts";

const textFile = {
  name: "notes.md",
  mimeType: "text/plain",
  data: Buffer.from("# Attachment\nRead this exact evidence.").toString(
    "base64",
  ),
};

test("attachments reach the model, persist with history, deduplicate and stay conversation scoped", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-attachments-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let f = await fixture(directory, undefined, true);
  t.after(() => f.app.close());
  const session = await f.service.createStandalone();
  const detail = await f.service.standalone(session.sessionId);
  const base = `/v1/sessions/${session.sessionId}/conversations/${detail.conversationId}`;
  const image = {
    name: "square.png",
    mimeType: "image/png",
    data: (
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: "red" },
      })
        .png()
        .toBuffer()
    ).toString("base64"),
  };
  let inspected = false;
  f.faux.setResponses([
    (transcript) => {
      const user = transcript.messages.find(
        (message) => message.role === "user",
      );
      assert.ok(user && Array.isArray(user.content));
      assert.ok(
        user.content.some(
          (block) =>
            block.type === "text" &&
            block.text.includes("Read this exact evidence."),
        ),
      );
      assert.ok(
        user.content.some(
          (block) =>
            block.type === "image" &&
            block.mimeType === "image/webp" &&
            block.data,
        ),
      );
      inspected = true;
      return fauxAssistantMessage("Read the attachments.");
    },
  ]);
  const payload = {
    content: "",
    requestId: randomUUID(),
    model: { provider: "test", modelId: "reasoning-model" },
    attachments: [textFile, image],
  };
  const admitted = await f.app.inject({
    method: "POST",
    url: `${base}/messages`,
    payload,
  });
  assert.equal(admitted.statusCode, 202, admitted.body);
  const { harness } = await f.service.session(session.sessionId);
  await harness.waitForIdle(context);
  assert.ok(inspected);
  const retried = await f.app.inject({
    method: "POST",
    url: `${base}/messages`,
    payload,
  });
  assert.equal(retried.json().id, admitted.json().id);
  assert.equal(f.faux.state.callCount, 1);
  const history = await f.app.inject(`${base}/history`);
  const user = history
    .json()
    .messages.find((message: { role: string }) => message.role === "user");
  assert.equal(user.text, "");
  assert.equal(user.attachments.length, 2);
  assert.ok(user.attachments[1].thumbnail);
  assert.ok(!history.body.includes(image.data));
  assert.ok(!history.body.includes(textFile.data));
  assert.equal(
    (await f.app.inject(`${base}/entries/${user.entryId}/attachments/0`)).json()
      .data,
    textFile.data,
  );
  const storedImage = (
    await f.app.inject(`${base}/entries/${user.entryId}/attachments/1`)
  ).json();
  assert.equal(storedImage.mimeType, "image/png");
  assert.equal(storedImage.data, image.data);
  assert.equal(
    (await sharp(Buffer.from(storedImage.data, "base64")).metadata()).width,
    32,
  );
  const other = await f.service.createStandalone();
  const otherDetail = await f.service.standalone(other.sessionId);
  assert.equal(
    (
      await f.app.inject(
        `/v1/sessions/${other.sessionId}/conversations/${otherDetail.conversationId}/entries/${user.entryId}/attachments/0`,
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (await f.app.inject(`${base}/entries/${user.entryId}/attachments/3`))
      .statusCode,
    404,
  );
  const projection = messages(
    (await f.service.history(session.sessionId, String(detail.conversationId)))
      .items,
  );
  assert.ok(Buffer.byteLength(JSON.stringify(projection)) < 10000);
  await f.app.close();
  f = await fixture(directory, undefined, true);
  assert.deepEqual(
    (await f.app.inject(`${base}/history`)).json(),
    history.json(),
  );
  assert.equal(
    (await f.app.inject(`${base}/entries/${user.entryId}/attachments/0`)).json()
      .data,
    textFile.data,
  );
});

test("attachment admission rejects invalid encodings, binary data, limits and models without image support", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "console-invalid-attachments-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(directory, undefined, true);
  t.after(() => f.app.close());
  const session = await f.service.createStandalone();
  const detail = await f.service.standalone(session.sessionId);
  const url = `/v1/sessions/${session.sessionId}/conversations/${detail.conversationId}/messages`;
  const invalid = [
    [{ ...textFile, data: "!!!" }],
    [{ ...textFile, data: Buffer.from([0, 1, 2]).toString("base64") }],
    [{ ...textFile, data: Buffer.from([255]).toString("base64") }],
    [{ ...textFile, name: "../outside" }],
    [{ ...textFile, mimeType: "application/pdf" }],
    [
      {
        ...textFile,
        data: Buffer.alloc(128 * 1024 + 1, 97).toString("base64"),
      },
    ],
    Array(5).fill(textFile),
    [{ ...textFile, mimeType: "image/png" }],
  ];
  for (const attachments of invalid) {
    const response = await f.app.inject({
      method: "POST",
      url,
      payload: {
        content: "Read",
        requestId: randomUUID(),
        model: { provider: "test", modelId: "reasoning-model" },
        attachments,
      },
    });
    assert.equal(response.statusCode, 400, response.body);
  }
  const image = {
    name: "image.png",
    mimeType: "image/png",
    data: (
      await sharp({
        create: { width: 1, height: 1, channels: 3, background: "red" },
      })
        .png()
        .toBuffer()
    ).toString("base64"),
  };
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url,
        payload: {
          content: "",
          requestId: randomUUID(),
          model: { provider: "test", modelId: "test-model" },
          attachments: [image],
        },
      })
    ).statusCode,
    400,
  );
  const oversized = await f.app.inject({
    method: "POST",
    url,
    payload: JSON.stringify({ content: "x".repeat(3 * 1024 * 1024) }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(oversized.statusCode, 413);
  assert.equal(f.faux.state.callCount, 0);
});
