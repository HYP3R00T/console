import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalProjectExecutor } from "../src/execution/local.ts";
import { ExecutionError } from "../src/execution/types.ts";

test("inspection reads evidence, searches literals and rejects other-project paths/symlinks", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-inspect-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "project");
  await mkdir(root);
  await writeFile(
    join(root, "README.md"),
    "Project purpose\nUses Fastify\nThird line\n",
  );
  await writeFile(join(directory, "private.txt"), "not project evidence");
  await symlink(join(directory, "private.txt"), join(root, "linked"));
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "node_modules", "ignored"), "Fastify");
  const scope = { id: "test", name: "Test", directory: root };
  const executor = new LocalProjectExecutor();
  const read = await executor.inspect(scope, {
    kind: "read",
    path: "README.md",
    offset: 2,
    limit: 1,
  });
  assert.deepEqual(read, {
    path: "README.md",
    offset: 2,
    text: "2: Uses Fastify",
    truncated: true,
    note: "Bounded preview; file content may be incomplete.",
  });
  const search = (await executor.inspect(scope, {
    kind: "search",
    path: ".",
    query: "Fastify",
  })) as { matches: unknown[]; skipped: number };
  assert.deepEqual(search.matches, [
    { path: "README.md", line: 2, text: "Uses Fastify" },
  ]);
  assert.equal(search.skipped, 2);
  for (const path of [
    "../private.txt",
    join(directory, "private.txt"),
    "linked",
  ])
    await assert.rejects(
      executor.inspect(scope, { kind: "read", path, offset: 1, limit: 10 }),
      (error) =>
        error instanceof ExecutionError && error.code === "outside_project",
    );
  await assert.rejects(
    executor.inspect(scope, { kind: "list", path: "missing" }),
    (error) => error instanceof ExecutionError && error.code === "not_found",
  );
  await assert.rejects(
    executor.inspect(scope, { kind: "list", path: "README.md" }),
    (error) =>
      error instanceof ExecutionError && error.code === "not_directory",
  );
  const controller = new AbortController();
  await assert.rejects(
    executor.inspect(scope, {
      kind: "read",
      path: "README.md",
      offset: 999,
      limit: 1,
    }),
    (error) =>
      error instanceof ExecutionError && error.code === "offset_out_of_range",
  );
  controller.abort();
  await assert.rejects(
    executor.inspect(scope, { kind: "list", path: "." }, controller.signal),
    { name: "AbortError" },
  );
});

test("inspection bounds directory, text and binary results", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-inspect-limits-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const scope = { id: "test", name: "Test", directory };
  const executor = new LocalProjectExecutor();
  await Promise.all(
    Array.from({ length: 205 }, (_, i) =>
      writeFile(join(directory, `${i}.txt`), "needle\n"),
    ),
  );
  const list = (await executor.inspect(scope, { kind: "list", path: "." })) as {
    entries: unknown[];
    truncated: boolean;
  };
  assert.equal(list.entries.length, 200);
  assert.equal(list.truncated, true);
  const search = (await executor.inspect(scope, {
    kind: "search",
    path: ".",
    query: "needle",
  })) as { matches: unknown[]; truncated: boolean };
  assert.equal(search.matches.length, 100);
  assert.equal(search.truncated, true);
  await writeFile(join(directory, "large.txt"), "x".repeat(300000));
  const read = (await executor.inspect(scope, {
    kind: "read",
    path: "large.txt",
    offset: 1,
    limit: 1,
  })) as { text: string; truncated: boolean };
  assert.equal(read.text.length, 16000);
  assert.equal(read.truncated, true);
  await writeFile(join(directory, "binary"), Buffer.from([0, 1, 2]));
  await assert.rejects(
    executor.inspect(scope, {
      kind: "read",
      path: "binary",
      offset: 1,
      limit: 1,
    }),
    (error) => error instanceof ExecutionError && error.code === "binary_file",
  );
});
