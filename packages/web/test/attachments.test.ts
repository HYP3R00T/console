import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentBytes,
  readFiles,
  wireAttachments,
} from "../src/components/sessions/attachments.ts";

test("selected files preserve UTF-8 bytes, normalize code MIME and strip client IDs on delivery", async () => {
  const source = "\ufeffconst name = '東京';\n";
  const files = await readFiles(
    [new File([source], "index.ts", { type: "video/mp2t" })],
    [],
  );
  assert.equal(files[0].mimeType, "text/plain");
  assert.equal(Buffer.from(files[0].data, "base64").toString(), source);
  assert.equal(attachmentBytes(files[0]), Buffer.byteLength(source));
  assert.deepEqual(Object.keys(wireAttachments(files)[0]).sort(), [
    "data",
    "mimeType",
    "name",
  ]);
  const added = await readFiles([new File(["next"], "notes.md")], files);
  assert.equal(added.length, 2);
  assert.notEqual(added[0].id, added[1].id);
});
test("file selection rejects binary/unsupported files and enforces combined limits before reading", async () => {
  for (const file of [
    new File([new Uint8Array([255])], "bad.txt"),
    new File([new Uint8Array([0])], "binary.txt"),
    new File(["%PDF"], "file.pdf", { type: "application/pdf" }),
    new File(["x".repeat(128 * 1024 + 1)], "large.txt"),
  ])
    await assert.rejects(() => readFiles([file], []));
  await assert.rejects(() =>
    readFiles(
      Array.from({ length: 5 }, () => new File(["x"], "a.txt")),
      [],
    ),
  );
  await assert.rejects(() =>
    readFiles(
      [
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", {
          type: "image/png",
        }),
      ],
      [],
    ),
  );
});
