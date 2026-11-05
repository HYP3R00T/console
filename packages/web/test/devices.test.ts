import assert from "node:assert/strict";
import test from "node:test";
import {
  newDevice,
  parseConnectedDevices,
  parseDevices,
} from "../src/lib/devices.ts";

test("remembered connections retain multiple IDs, migrate the old selection and ignore forgotten devices", () => {
  const a = newDevice([], "A", "http://localhost:3000", "a");
  const b = newDevice([a], "B", "http://localhost:4000", "b");
  const saved = [a, b];
  assert.deepEqual(
    parseConnectedDevices('["a","b","a","forgotten"]', null, saved),
    ["a", "b"],
  );
  assert.deepEqual(parseConnectedDevices(null, "b", saved), ["b"]);
  assert.deepEqual(parseConnectedDevices("[]", "a", saved), []);
  assert.throws(() => parseConnectedDevices("[123]", null, saved));
  const identified = {
    ...a,
    backendId: "11111111-1111-4111-8111-111111111111",
  };
  assert.deepEqual(parseDevices(JSON.stringify([identified])), [identified]);
});

test("device bookmarks normalize URLs and round-trip without connection state", () => {
  const device = newDevice(
    [],
    " Workstation ",
    "http://localhost:3000/",
    "device-1",
  );
  assert.deepEqual(device, {
    id: "device-1",
    name: "Workstation",
    url: "http://localhost:3000",
  });
  assert.deepEqual(parseDevices(JSON.stringify([device])), [device]);
  assert.deepEqual(parseDevices(null), []);
});

test("duplicate URLs and unsafe addresses cannot be saved", () => {
  const device = newDevice([], "First", "http://127.0.0.1:3000", "one");
  assert.throws(
    () => newDevice([device], "Duplicate", "http://127.0.0.1:3000/", "two"),
    /already saved/,
  );
  assert.throws(
    () => newDevice([], "Remote", "https://example.com", "two"),
    /loopback/,
  );
  assert.throws(
    () => newDevice([], " ", "http://localhost:3000", "two"),
    /name/,
  );
});

test("corrupt or duplicate saved records are rejected rather than trusted", () => {
  const device = newDevice([], "First", "http://127.0.0.1:3000", "one");
  for (const value of [
    "not json",
    "{}",
    '[{"name":"Missing URL"}]',
    JSON.stringify([device, device]),
    JSON.stringify([{ ...device, url: "https://example.com" }]),
  ]) {
    assert.throws(() => parseDevices(value));
  }
});

test("machine icon and color survive reload, with old bookmarks kept intact", () => {
  const device = newDevice([], "Local", "http://localhost:3000", "local");
  const customized = { ...device, icon: "laptop", color: "violet" };
  assert.deepEqual(parseDevices(JSON.stringify([customized])), [customized]);
  assert.deepEqual(parseDevices(JSON.stringify([device])), [device]);
  for (const appearance of [
    { icon: "unknown" },
    { color: "not-a-color" },
    { icon: null },
    { color: 123 },
  ]) {
    assert.throws(
      () => parseDevices(JSON.stringify([{ ...device, ...appearance }])),
      /appearance/,
    );
  }
});
