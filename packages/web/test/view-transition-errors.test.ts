import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const compiled = join(
  dirname(require.resolve("next/package.json")),
  "dist/compiled",
);

// Exercise the bundled error filters, including production's inline version.
// A separate react-dom dependency is not the runtime used by the App Router.
for (const runtime of ["react-dom", "react-dom-experimental"]) {
  const directory = join(compiled, runtime, "cjs");
  for (const file of readdirSync(directory)) {
    if (!/react-dom-(client|profiling|unstable_testing).*\.js$/.test(file))
      continue;
    test(`${runtime}/${file} ignores only known transition skips`, () => {
      const source = readFileSync(join(directory, file), "utf8");
      const match = source.match(
        /case "InvalidStateError":\s*(if \([\s\S]*?\)\s*(?:return null;|error = null;))/,
      );
      assert.ok(match, "bundled transition error filter must exist");
      const filter = runInNewContext(
        `(error) => { switch (error.name) { case "InvalidStateError": ${match[1]} } return error; }`,
      );
      for (const message of [
        "Transition was aborted because of invalid state",
        "Transition was aborted because of invalid state. Document hidden",
        "View transition was skipped because document visibility state is hidden.",
      ]) {
        assert.equal(
          filter(new DOMException(message, "InvalidStateError")),
          null,
        );
      }
      for (const error of [
        new DOMException("Duplicate view-transition-name", "InvalidStateError"),
        new DOMException("Unexpected invalid state", "InvalidStateError"),
        new Error(
          "Transition was aborted because of invalid state. Document hidden",
        ),
        new DOMException("Update failed", "AbortError"),
      ]) {
        assert.equal(filter(error), error);
      }
    });
  }
}
