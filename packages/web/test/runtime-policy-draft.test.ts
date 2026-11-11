import assert from "node:assert/strict";
import test from "node:test";
import {
  type RuntimePolicyDraft,
  resetRuntimePolicyDraft,
  runtimePolicyDraftInvalid,
  runtimePolicyDraftValue,
} from "../src/lib/runtime-policy-draft.ts";

test("restoring defaults stages a reset without mutating the confirmed policy", () => {
  const saved = {
    retry: { maxRetries: 3 },
    compaction: { modelOverrides: { "a/model": { enabled: false } } },
  };
  const before = structuredClone(saved);
  const draft = resetRuntimePolicyDraft(saved);
  assert.equal(runtimePolicyDraftValue(draft), null);
  assert.equal(runtimePolicyDraftInvalid(saved, draft), false);
  assert.deepEqual(saved, before);
  assert.deepEqual(
    runtimePolicyDraftValue({ ...draft, values: { "retry.maxRetries": "0" } }),
    { retry: { maxRetries: 0 } },
  );
});

test("one policy draft preserves existing settings and converts model overrides on save", () => {
  const saved = {
    retry: { maxRetries: 3, enabled: true },
    compaction: {
      reserveTokens: 8000,
      modelOverrides: { "a/model": { enabled: true } },
    },
  };
  const draft: RuntimePolicyDraft = {
    original: JSON.stringify(saved),
    base: saved,
    values: { "retry.enabled": "false" },
    models: { "b/model": { enabled: "false", keepRecentTokens: "4000" } },
  };
  assert.equal(runtimePolicyDraftInvalid(saved, draft), false);
  assert.deepEqual(runtimePolicyDraftValue(draft), {
    retry: { maxRetries: 3, enabled: false },
    compaction: {
      reserveTokens: 8000,
      modelOverrides: { "b/model": { enabled: false, keepRecentTokens: 4000 } },
    },
  });
  assert.equal(saved.retry.enabled, true);
});

test("invalid intermediate field and model edits are retained and cannot serialize", () => {
  const reset = resetRuntimePolicyDraft({});
  const drafts: RuntimePolicyDraft[] = [
    { ...reset, values: { "retry.maxRetries": "1.5" } },
    { ...reset, models: { "a/model": { keepRecentTokens: "-1" } } },
    { ...reset, values: { toolExecution: "unsupported" } },
  ];
  for (const draft of drafts) {
    assert.equal(runtimePolicyDraftInvalid({}, draft), true);
    assert.throws(() => runtimePolicyDraftValue(draft));
  }
});
