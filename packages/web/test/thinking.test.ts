import assert from "node:assert/strict";
import test from "node:test";
import { modelThinking } from "../src/lib/chat/thinking.ts";

test("off-only and unknown models do not offer a thinking control", () => {
  assert.equal(modelThinking().available, false);
  assert.deepEqual(modelThinking({ thinkingLevels: ["off"] }, "high"), {
    levels: ["off"],
    available: false,
    adjustable: false,
    level: "off",
  });
});
test("the slider exposes every capability tier in provider order without global filtering", () => {
  const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
  const thinking = modelThinking({ thinkingLevels: levels }, "max");
  assert.deepEqual(thinking.levels, levels);
  assert.equal(thinking.level, "max");
  assert.equal(thinking.adjustable, true);
});
test("switching models retains only a supported choice and never invents intermediate tiers", () => {
  const limited = { thinkingLevels: ["off", "high"] };
  assert.deepEqual(modelThinking(limited, "medium").levels, ["off", "high"]);
  assert.equal(modelThinking(limited, "medium").level, "off");
  assert.equal(modelThinking(limited, "high").level, "high");
});
test("a fixed thinking model exposes its one supported value without a slider", () => {
  assert.deepEqual(modelThinking({ thinkingLevels: ["high"] }, "off"), {
    levels: ["high"],
    available: true,
    adjustable: false,
    level: "high",
  });
});
test("capability labels are catalog data rather than a frontend vocabulary", () => {
  const levels = ["adaptive", "extended"];
  assert.deepEqual(modelThinking({ thinkingLevels: levels }, "extended"), {
    levels,
    available: true,
    adjustable: true,
    level: "extended",
  });
});
