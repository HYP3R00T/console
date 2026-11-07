import assert from "node:assert/strict";
import test from "node:test";
import { taskDiagnostic } from "../src/harnesses/task-diagnostics.ts";

test("task diagnostics explain recovery boundaries without leaking payloads", () => {
  const secret = "private provider request and credentials";
  for (const status of ["failed", "faulted"] as const) {
    const message = taskDiagnostic({
      status,
      error: { message: secret, detail: { reason: "restart_limit", secret } },
    });
    assert.ok(message);
    assert.match(message, /restart limit/);
    assert.match(message, /does not resume/);
    assert.ok(!message.includes(secret));
    for (const detail of [null, secret, [secret], { reason: secret }]) {
      const diagnostic = taskDiagnostic({
        status,
        error: { message: secret, detail },
      });
      assert.ok(diagnostic);
      assert.match(diagnostic, /side effects/);
      assert.ok(!diagnostic.includes(secret));
    }
  }
  const orphaned = taskDiagnostic({ status: "orphaned", reason: secret });
  assert.ok(orphaned);
  assert.match(orphaned, /compatible backend/);
  assert.ok(!orphaned.includes(secret));
  const aborted = taskDiagnostic({ status: "aborted", reason: secret });
  assert.ok(aborted);
  assert.match(aborted, /cancelled/);
  assert.equal(
    taskDiagnostic({ status: "completed", result: secret }),
    undefined,
  );
  assert.equal(taskDiagnostic(undefined), undefined);
});
