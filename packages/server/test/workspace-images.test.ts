import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import sharp from "sharp";
import { fixture } from "./support/harness-fixture.ts";

for (const planMode of [false, true]) {
  test(`${planMode ? "Plan" : "Coding"} read resizes workspace images for vision models`, {
    timeout: 15000,
  }, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "console-workspace-image-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const f = await fixture(directory, undefined, true);
    t.after(() => f.app.close());
    await sharp({
      create: { width: 3000, height: 100, channels: 3, background: "red" },
    })
      .png()
      .toFile(join(directory, "wide.png"));
    const project = await f.projects.register("Images", directory);
    const { sessionId } = (await f.service.list(project.id)).sessions[0];
    const { harness } = await f.service.session(sessionId);
    const root = await harness.root(context);
    const id = String(root.id);
    if (planMode) {
      const config = await f.service.configuration(sessionId, id);
      await f.service.configureConversation(sessionId, id, {
        revision: config.revision,
        planMode: true,
      });
    }
    let inspected = false;
    f.faux.setResponses([
      fauxAssistantMessage(fauxToolCall("read", { path: "wide.png" }), {
        stopReason: "toolUse",
      }),
      async (request) => {
        const result = request.messages.find(
          (message) => message.role === "toolResult",
        );
        assert.ok(result && result.role === "toolResult");
        assert.equal(result.isError, false);
        const image = result.content.find((block) => block.type === "image");
        assert.ok(image && image.type === "image");
        const metadata = await sharp(
          Buffer.from(image.data, "base64"),
        ).metadata();
        assert.ok(metadata.width <= 2000);
        assert.ok(metadata.height <= 2000);
        assert.ok(image.data.length <= 4.5 * 1024 * 1024);
        inspected = true;
        return fauxAssistantMessage("A wide red image.");
      },
    ]);
    await f.service.submit(sessionId, id, "Inspect wide.png", randomUUID(), {
      model: { provider: "test", modelId: "reasoning-model" },
    });
    await harness.waitForIdle(context);
    assert.ok(inspected);
  });
}
