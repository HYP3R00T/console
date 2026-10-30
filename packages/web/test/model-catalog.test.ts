import assert from "node:assert/strict";
import test from "node:test";
import type { Provider } from "../src/lib/api.ts";
import { visibleModelGroups } from "../src/lib/chat/model-catalog.ts";

const model = {
  id: "shared",
  name: "Shared",
  thinkingLevels: ["off", "high"],
  contextWindow: 128000,
};
const providers: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    configured: true,
    methods: [],
    models: [model],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    configured: true,
    methods: [],
    models: [model],
  },
];

test("favorites distinguish the same model ID across providers", () => {
  const groups = visibleModelGroups(providers, ["openrouter/shared"]);
  assert.deepEqual(
    groups.map((group) => group.id),
    ["openrouter"],
  );
  assert.deepEqual(groups[0].models[0], model);
});
test("multiple provider groups retain their names and model metadata", () => {
  const groups = visibleModelGroups(providers, [
    "openai/shared",
    "openrouter/shared",
  ]);
  assert.deepEqual(
    groups.map(({ name, models }) => ({ name, models })),
    [
      { name: "OpenAI", models: [model] },
      { name: "OpenRouter", models: [model] },
    ],
  );
});
test("current and opening selections remain available without fabricating missing catalog entries", () => {
  const config = (provider: string, model = "shared") => ({
    provider,
    model,
    thinkingLevel: "off",
  });
  assert.equal(
    visibleModelGroups(providers, [], config("openai"), config("openrouter"))
      .length,
    2,
  );
  assert.deepEqual(
    visibleModelGroups(
      providers,
      ["openai/missing"],
      config("openai", "missing"),
    ),
    [],
  );
});
