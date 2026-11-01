import assert from "node:assert/strict";
import test from "node:test";
import { newDevice, parseDevices } from "../src/lib/devices.ts";

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
