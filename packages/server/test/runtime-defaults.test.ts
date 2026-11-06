import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { AgentDoc } from "@earendil-works/pi-durable";
import { fixture } from "./support/harness-fixture.ts";

test("machine defaults are validated, persisted, and copied only on creation", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "console-runtime-defaults-"));
  const projectDir = join(dir, "project");
  mkdirSync(projectDir);
  let f = await fixture(dir);
  t.after(async () => {
    await f.app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const url = "/v1/machine/runtime-defaults";
  const save = (revision: number, defaults: unknown) =>
    f.app.inject({ method: "PUT", url, payload: { revision, defaults } });
  const model = { provider: "test", modelId: "reasoning-model" };
  const project = await f.projects.register("Project", projectDir);
  const initialSession = (await f.service.list(project.id)).sessions[0];
  const agent = async (sessionId: string, id?: number) => {
    const { harness } = await f.service.session(sessionId);
    const root = await harness.root(context);
    return harness.snapshot(
      AgentDoc,
      id === undefined ? root.id : (id as typeof root.id),
      context,
    );
  };
  const original = await agent(initialSession.sessionId);
  const initial = await f.app.inject({ url });
  const initialState = initial.json();
  assert.equal(initialState.defaults, null);
  const thinkingLevel = initialState.models
    .find((item: { id: string }) => item.id === model.modelId)
    .thinkingLevels.at(-1);
  assert.equal(typeof thinkingLevel, "string");
  assert.equal(
    (await save(0, { model, thinkingLevel: "invalid" })).statusCode,
    400,
  );
  assert.equal(
    (await save(0, { model: { ...model, modelId: "unavailable" } })).statusCode,
    409,
  );
  const saved = await save(0, { model, thinkingLevel });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal((await save(0, null)).statusCode, 409);

  const creationId = randomUUID();
  const standalone = await f.app.inject({
    method: "POST",
    url: "/v1/standalone",
    payload: { creationId },
  });
  assert.equal(standalone.statusCode, 201, standalone.body);
  const childUrl = `/v1/sessions/${initialSession.sessionId}/conversations`;
  const child = await f.app.inject({
    method: "POST",
    url: childUrl,
    payload: { creationId },
  });
  assert.equal(child.statusCode, 201, child.body);
  const childId = child.json().id;
  const extraSession = await f.service.create(project.id);
  for (const state of [
    await agent(standalone.json().sessionId),
    await agent(initialSession.sessionId, childId),
    await agent(extraSession.sessionId),
  ]) {
    assert.deepEqual(state?.model, model);
    assert.equal(state?.thinkingLevel, thinkingLevel);
  }
  assert.deepEqual(await agent(initialSession.sessionId), original);

  const secondModel = { provider: "test", modelId: "test-model" };
  assert.equal((await save(1, { model: secondModel })).statusCode, 200);
  await f.app.close();
  f = await fixture(dir);
  const persisted = (await f.app.inject({ url })).json();
  assert.deepEqual(persisted.defaults, { model: secondModel });
  const retried = await f.app.inject({
    method: "POST",
    url: childUrl,
    payload: { creationId },
  });
  assert.equal(retried.statusCode, 201, retried.body);
  assert.equal(retried.json().id, childId);
  assert.deepEqual(
    (await agent(initialSession.sessionId, childId))?.model,
    model,
  );
  assert.deepEqual((await agent(standalone.json().sessionId))?.model, model);
  const next = await f.service.createStandalone();
  assert.deepEqual((await agent(next.sessionId))?.model, secondModel);
  assert.equal((await save(persisted.revision, null)).statusCode, 200);
  const reset = await f.service.createStandalone();
  assert.equal((await agent(reset.sessionId))?.model, undefined);
});
