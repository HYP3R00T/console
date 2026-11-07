import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFields,
  fieldError,
  modelFields,
  modelPolicies,
  policyGroups,
  setModelPolicy,
} from "../src/components/sessions/runtime-policy-form.ts";

test("policy drafts preserve unrelated overrides and distinguish default, zero and false", () => {
  const saved = {
    retry: { maxRetries: 3, enabled: true },
    compaction: { modelOverrides: { "test/model": { enabled: true } } },
  };
  const result = applyFields(
    saved,
    policyGroups.flatMap((group) => group.fields),
    { "retry.maxRetries": "0", "retry.enabled": "false" },
  );
  assert.deepEqual(result.retry, { maxRetries: 0, enabled: false });
  assert.deepEqual(modelPolicies(result), modelPolicies(saved));
  assert.deepEqual(saved.retry, { maxRetries: 3, enabled: true });
  const cleared = applyFields(
    result,
    policyGroups.flatMap((group) => group.fields),
    { "retry.maxRetries": "" },
  );
  assert.deepEqual(cleared.retry, { enabled: false });
});

test("per-model drafts convert values and removing one preserves other models", () => {
  const policy = applyFields({}, modelFields, {
    enabled: "false",
    backgroundTokens: "0",
    keepRecentTokens: "4000",
  });
  assert.deepEqual(policy, {
    enabled: false,
    backgroundTokens: 0,
    keepRecentTokens: 4000,
  });
  let saved = setModelPolicy(
    { compaction: { reserveTokens: 8000 } },
    "a/model",
    policy,
  );
  saved = setModelPolicy(saved, "b/model", { enabled: true });
  saved = setModelPolicy(saved, "a/model", null);
  assert.deepEqual(saved, {
    compaction: {
      reserveTokens: 8000,
      modelOverrides: { "b/model": { enabled: true } },
    },
  });
});

test("policy draft validation rejects fractions, negatives, unsupported modes and excessive values", () => {
  const fields = policyGroups.flatMap((group) => group.fields);
  for (const [key, value] of [
    ["restartLimit", "0"],
    ["retry.maxRetries", "11"],
    ["stream.timeoutMs", "1.5"],
    ["progress.persistWithinMs", "-1"],
    ["toolExecution", "unknown"],
  ]) {
    const field = fields.find((field) => field.key === key);
    assert.ok(field);
    assert.ok(fieldError(field, value));
    assert.throws(() => applyFields({}, fields, { [key]: value }));
  }
});
