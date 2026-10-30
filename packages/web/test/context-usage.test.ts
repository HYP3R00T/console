import assert from "node:assert/strict";
import test from "node:test";
import { contextEstimate } from "../src/lib/chat/context-usage.ts";

const usage = (estimatedTokens: number, capacity: number) => ({
  estimatedTokens,
  capacity,
  reserveTokens: 0,
  backgroundTokens: 0,
});
test("missing or invalid capacity does not invent a context percentage", () => {
  assert.equal(contextEstimate(), undefined);
  for (const value of [
    usage(1, 0),
    usage(-1, 100),
    usage(NaN, 100),
    usage(1, Infinity),
    usage(Number.MAX_VALUE, Number.MIN_VALUE),
  ])
    assert.equal(contextEstimate(value), undefined);
});
test("a known empty context is distinct from unavailable data", () => {
  assert.deepEqual(contextEstimate(usage(0, 100)), {
    used: 0,
    capacity: 100,
    fill: 0,
    label: "0%",
  });
});
test("context percentage uses the reported saved capacity", () => {
  const result = contextEstimate(usage(1954, 272000));
  assert.equal(result?.label, "0.7%");
  assert.equal(result?.capacity, 272000);
  assert.ok((result?.fill ?? 0) > 0);
});
test("very small usage remains distinguishable from empty", () => {
  assert.equal(contextEstimate(usage(1, 100000))?.label, "<0.1%");
});
test("over-capacity estimates fill the ring without hiding the reported excess", () => {
  assert.deepEqual(contextEstimate(usage(120, 100)), {
    used: 120,
    capacity: 100,
    fill: 100,
    label: "120%",
  });
});
