import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import type { Conversation } from "../../web/src/lib/api.ts";
import { createApp } from "../src/app.ts";
import { defaultSandbox } from "../src/sandbox/policy.ts";
import {
  expandPrompt,
  loadProjectResource,
  projectResources,
} from "../src/sandbox/resources.ts";
import { runSandbox } from "../src/sandbox/runner.ts";

test("project discovery respects instruction scope/precedence, resource boundaries and quoted arguments", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "console-resources-"));
  t.after(() => rm(root, { recursive: true }));
  await mkdir(join(root, "src"));
  await mkdir(join(root, ".pi/skills/review"), { recursive: true });
  await mkdir(join(root, ".pi/prompts"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "Root rules");
  await writeFile(join(root, "AGENTS.override.md"), "Override root rules");
  await writeFile(join(root, "src/AGENTS.md"), "Source-specific rules");
  await writeFile(
    join(root, ".pi/skills/review/SKILL.md"),
    "---\nname: review\ndescription: Review changes\n---\nInspect the changed code.",
  );
  await writeFile(
    join(root, ".pi/prompts/check.md"),
    `Check $1 using $2. All: $@. Tail: \${@:2:1}.`,
  );
  await writeFile(join(root, ".pi/SYSTEM.md"), "Project system instructions");
  await writeFile(join(root, ".pi/APPEND_SYSTEM.md"), "Project appendix");
  const resources = projectResources(root, "src");
  assert.deepEqual(
    resources.instructions.map((item) => item.content),
    [
      "Override root rules",
      "Source-specific rules",
      "Project system instructions",
      "Project appendix",
    ],
  );
  assert.equal(resources.skills[0]?.name, "review");
  const template = loadProjectResource(root, "prompt", "check");
  assert.equal(
    expandPrompt(template.content, '"two words" strict'),
    "Check two words using strict. All: two words strict. Tail: strict.",
  );
  assert.throws(() => projectResources(root, "../"), /stay in the project/);
  assert.throws(
    () => loadProjectResource(root, "skill", "../../secret"),
    /not found/,
  );
  await symlink(join(root, "src"), join(root, "alias"));
  assert.throws(() => projectResources(root, "alias"), /symlink/);
});

test("resource discovery and loads cannot escape nono through a symlink", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "console-resource-sandbox-"));
  t.after(() => rm(root, { recursive: true }));
  const workspace = join(root, "workspace");
  const data = join(root, "private");
  await mkdir(workspace);
  await mkdir(data);
  await writeFile(join(data, "SKILL.md"), "PRIVATE_RESOURCE");
  await mkdir(join(workspace, ".pi/skills"), { recursive: true });
  await symlink(data, join(workspace, ".pi/skills/leak"));
  const policy = { ...defaultSandbox(), enabled: true, workspace };
  const index = await runSandbox(policy, { operation: "resources" }, data);
  assert.ok(!index.includes("PRIVATE_RESOURCE"));
  assert.equal(JSON.parse(index).skills.length, 0);
  await assert.rejects(
    runSandbox(
      policy,
      { operation: "resources", resourceKind: "skill", resourceName: "leak" },
      data,
    ),
  );
});

test("Pi receives scoped instructions and can load skills; templates expand before durable admission and reload on edits", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "console-resource-agent-"));
  const workspace = join(root, "workspace");
  const data = join(root, "private");
  await mkdir(workspace);
  await mkdir(data);
  await mkdir(join(workspace, ".pi/skills/review"), { recursive: true });
  await mkdir(join(workspace, ".pi/prompts"), { recursive: true });
  await writeFile(
    join(workspace, "AGENTS.md"),
    "PROJECT_RULE_MARKER: inspect before changing.",
  );
  await writeFile(
    join(workspace, ".pi/skills/review/SKILL.md"),
    "Read tests before suggesting fixes.",
  );
  await writeFile(
    join(workspace, ".pi/prompts/check.md"),
    "Review $1 with $2 checks.",
  );
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const app = createApp({}, { dataDirectory: data, models: () => models });
  t.after(async () => {
    await app.close();
    await rm(root, { recursive: true });
  });
  const headers = { "x-console-request": "1" };
  const project = (
    await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers,
      payload: { name: "Resources", path: workspace, requestId: "resources" },
    })
  ).json();
  const created = (
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers,
      payload: { workspaceId: project.id, access: "read", requestId: "agent" },
    })
  ).json<Conversation>();
  const base = `/v1/sessions/${created.id}`;
  await app.inject({
    method: "PATCH",
    url: `${base}/config`,
    headers,
    payload: { provider: faux.provider.id, model: faux.getModel().id },
  });
  const index = await app.inject(`${base}/resources?revision=1`);
  assert.equal(index.statusCode, 200, index.body);
  assert.equal(index.json().skills[0].name, "review");
  faux.setResponses([
    (context) => {
      const messages = JSON.stringify(context.messages);
      assert.match(messages, /PROJECT_RULE_MARKER/);
      assert.match(messages, /Review two words with strict checks/);
      return fauxAssistantMessage(
        fauxToolCall("load_project_resource", {
          kind: "skill",
          name: "review",
        }),
        { stopReason: "toolUse" },
      );
    },
    (context) => {
      assert.match(
        JSON.stringify(context.messages.at(-1)),
        /Read tests before suggesting fixes/,
      );
      return fauxAssistantMessage("Resource-backed answer");
    },
  ]);
  const payload = {
    text: '/prompt:check "two words" strict',
    requestId: "template",
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${base}/messages`,
        headers,
        payload,
      })
    ).statusCode,
    202,
  );
  for (let n = 0; n < 300; n++) {
    const value = (await app.inject(base)).json<Conversation>();
    if (
      value.status === "idle" &&
      value.messages.at(-1)?.text === "Resource-backed answer"
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(
    (await app.inject(base)).json<Conversation>().messages.at(-1)?.text,
    "Resource-backed answer",
  );
  await writeFile(join(workspace, "AGENTS.md"), "UPDATED_PROJECT_RULE");
  assert.equal(
    (await app.inject(`${base}/resources`)).json().instructions[0].content,
    "UPDATED_PROJECT_RULE",
  );
  const calls = faux.state.callCount;
  await app.inject({
    method: "POST",
    url: `${base}/messages`,
    headers,
    payload,
  });
  assert.equal(faux.state.callCount, calls);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `${base}/messages`,
        headers,
        payload: { text: "/skill:missing", requestId: "missing" },
      })
    ).statusCode,
    400,
  );
});
