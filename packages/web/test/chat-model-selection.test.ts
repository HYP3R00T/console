import assert from "node:assert/strict";
import test from "node:test";
import {
  type ChatModel,
  resolveChatModelSelection,
} from "../src/components/sessions/use-chat-models.ts";

const models: ChatModel[] = ["one", "two"].map((id) => ({
  provider: "test",
  id,
  name: id,
  reasoning: true,
  thinkingLevels: ["off", "low", "high"],
}));
const current = { provider: "test", modelId: "one" };
const key = (id: string) => JSON.stringify(["test", id]);

test("reopening a conversation restores its last submitted thinking level", () => {
  assert.equal(
    resolveChatModelSelection(models, current, "high").level,
    "high",
  );
  assert.equal(resolveChatModelSelection(models, current, "low").level, "low");
});

test("returning to the saved model restores thinking instead of resetting it", () => {
  assert.equal(
    resolveChatModelSelection(models, current, "high", { key: key("two") })
      .level,
    "off",
  );
  assert.equal(
    resolveChatModelSelection(models, current, "high", { key: key("one") })
      .level,
    "high",
  );
});

test("a tentative level stays local and never mutates the submitted preference", () => {
  assert.equal(
    resolveChatModelSelection(models, current, "high", {
      key: key("one"),
      level: "low",
    }).level,
    "low",
  );
  assert.equal(
    resolveChatModelSelection(models, current, "high").level,
    "high",
  );
  assert.equal(
    resolveChatModelSelection(models, current, "unsupported").level,
    "off",
  );
});
