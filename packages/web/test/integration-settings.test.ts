import assert from "node:assert/strict";
import test from "node:test";
import {
  parseIntegrationDraft,
  upsertIntegration,
} from "../src/lib/integration-settings.ts";

test("integration forms preserve argument boundaries, explicit empty tool allowlists and sibling entries", () => {
  const configuration = {
    servers: {
      first: {
        command: "/bin/first",
        args: ["", "two words", "--flag=value"],
        tools: [],
      },
      second: { command: "/bin/second" },
    },
  };
  const renamed = upsertIntegration(
    configuration,
    "mcp",
    "renamed",
    configuration.servers.first,
    "first",
  );
  assert.deepEqual(renamed.servers.renamed, configuration.servers.first);
  assert.deepEqual(renamed.servers.second, configuration.servers.second);
  assert.equal(Object.hasOwn(renamed.servers, "first"), false);
  assert.ok(Object.hasOwn(configuration.servers, "first"));
  assert.throws(() =>
    upsertIntegration(
      configuration,
      "mcp",
      "second",
      { command: "/bin/test" },
      "first",
    ),
  );
  assert.throws(() =>
    upsertIntegration(configuration, "mcp", "bad name", {
      command: "/bin/test",
    }),
  );
  assert.throws(() =>
    upsertIntegration(configuration, "mcp", "new", { command: "relative" }),
  );
});

test("integration JSON cannot silently discard an unexpected root and new entries respect limits", () => {
  for (const text of [
    "null",
    "[]",
    '{"servers":[]}',
    '{"servers":{"a":null}}',
    '{"servers":{},"profiles":{}}',
  ])
    assert.equal(parseIntegrationDraft(text, "mcp"), undefined);
  assert.deepEqual(parseIntegrationDraft('{"profiles":{}}', "ssh"), {
    profiles: {},
  });
  const servers = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      `server-${i}`,
      { command: "/bin/server" },
    ]),
  );
  assert.throws(() =>
    upsertIntegration({ servers }, "mcp", "ninth", { command: "/bin/server" }),
  );
  assert.doesNotThrow(() =>
    upsertIntegration(
      { servers },
      "mcp",
      "renamed",
      { command: "/bin/new" },
      "server-0",
    ),
  );
  assert.throws(() =>
    upsertIntegration({ profiles: {} }, "ssh", "host", { host: "example.org" }),
  );
});
