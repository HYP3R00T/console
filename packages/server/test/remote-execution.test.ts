import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { fixture } from "./support/harness-fixture.ts";

test("SSH workspaces route coding tools and checks and fail closed after profile removal", {
  skip: !["linux", "darwin"].includes(process.platform),
  timeout: 20000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "console-ssh-"));
  const projectPath = join(directory, "project");
  const remotePath = join(directory, "remote");
  const remoteHome = join(directory, "home");
  const bin = join(directory, "bin");
  const configPath = join(directory, "execution.json");
  const knownHostsFile = join(directory, "known-hosts");
  const originalPath = process.env.PATH;
  t.after(() => {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    delete process.env.CONSOLE_TEST_SSH_HOME;
    delete process.env.CONSOLE_TEST_SSH_KEYS;
  });
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all(
    [projectPath, remotePath, remoteHome, bin].map((dir) => mkdir(dir)),
  );
  process.env.PATH = [bin, originalPath].join(delimiter);
  process.env.CONSOLE_TEST_SSH_HOME = remoteHome;
  process.env.CONSOLE_TEST_SSH_KEYS = knownHostsFile;
  // Exercise Pi Env's daemon deployment and protocol without contacting a host.
  await writeFile(
    join(bin, "ssh"),
    `#!/bin/sh
set -eu
strict=no
alias=no
keyfile=no
while [ "$1" != "--" ]; do
  case "$1" in
    StrictHostKeyChecking=yes) strict=yes ;;
    HostKeyAlias=console-fixture) alias=yes ;;
    UserKnownHostsFile=*) [ "$1" = "UserKnownHostsFile=\\"$CONSOLE_TEST_SSH_KEYS\\"" ] && keyfile=yes ;;
  esac
  shift
done
test "$strict$alias$keyfile" = yesyesyes
test "$2" = ssh-fixture.invalid
shift 2
if [ ! -s "$CONSOLE_TEST_SSH_KEYS" ]; then
  echo "Host key verification failed." >&2
  exit 255
fi
export HOME="$CONSOLE_TEST_SSH_HOME"
export SHELL=/bin/sh
exec /bin/sh -c "$*"
`,
    { mode: 0o700 },
  );
  await writeFile(
    configPath,
    JSON.stringify({
      profiles: {
        builder: {
          host: "ssh-fixture.invalid",
          hostKeyAlias: "console-fixture",
          knownHostsFile,
          identityFile: join(directory, "fixture-identity"),
          cwd: remotePath,
        },
      },
    }),
    { mode: 0o600 },
  );

  let f = await fixture(directory);
  t.after(() => f.app.close());
  const project = await f.projects.register("SSH fixture", projectPath);
  const { sessionId } = (await f.service.list(project.id)).sessions[0];
  let { harness } = await f.service.session(sessionId);
  const id = String((await harness.root(context)).id);
  const base = `/v1/sessions/${sessionId}/conversations`;
  const path = `${base}/${id}`;
  const configuration = async () =>
    (await f.app.inject(`${path}/configuration`)).json();
  const change = async (settings: Record<string, unknown>) =>
    f.app.inject({
      method: "PATCH",
      url: `${path}/configuration`,
      payload: { revision: (await configuration()).revision, ...settings },
    });

  const status = await configuration();
  assert.deepEqual(status.remote, {
    profile: null,
    profiles: ["builder"],
    invalid: false,
  });
  assert.doesNotMatch(
    JSON.stringify(status),
    /ssh-fixture\.invalid|fixture-identity|known-hosts/,
  );
  const rejected = await change({ remoteProfile: "builder" });
  assert.equal(rejected.statusCode, 409, rejected.body);
  assert.doesNotMatch(rejected.body, /ssh-fixture\.invalid|known-hosts/);
  assert.equal((await configuration()).remote.profile, null);
  await writeFile(knownHostsFile, "fixture trust\n");
  const selected = await change({ remoteProfile: "builder" });
  assert.equal(selected.statusCode, 200, selected.body);
  assert.equal((await change({ sandbox: true })).statusCode, 409);
  assert.equal((await change({ mcp: true })).statusCode, 409);
  const check = await change({
    postRunCommand: "test -f result.txt && printf ssh-check-passed",
  });
  assert.equal(check.statusCode, 200, check.body);

  const write = (name: string) =>
    fauxAssistantMessage(
      fauxToolCall("write", { path: name, content: "remote result" }),
      { stopReason: "toolUse" },
    );
  const submit = async (name: string) => {
    f.faux.setResponses([write(name), fauxAssistantMessage("Done.")]);
    const submission = await f.service.submit(
      sessionId,
      id,
      "Write a file",
      randomUUID(),
      {
        model: { provider: "test", modelId: "test-model" },
      },
    );
    await harness.waitForIdle(context);
    return submission;
  };
  await submit("result.txt");
  assert.equal(
    await readFile(join(remotePath, "result.txt"), "utf8"),
    "remote result",
  );
  await assert.rejects(readFile(join(projectPath, "result.txt")), {
    code: "ENOENT",
  });
  const history = (await f.app.inject(`${path}/history`)).json();
  assert.match(JSON.stringify(history.messages), /ssh-check-passed/);
  let reviewRead = false;
  f.faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("review_workspace", { brief: "Read result.txt" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxToolCall("read", { path: "result.txt" }), {
      stopReason: "toolUse",
    }),
    async (request) => {
      reviewRead = request.messages.some(
        (message) =>
          message.role === "toolResult" &&
          message.toolName === "read" &&
          JSON.stringify(message.content).includes("remote result"),
      );
      return fauxAssistantMessage("The file exists.");
    },
    fauxAssistantMessage("Review complete."),
  ]);
  await f.service.submit(sessionId, id, "Review the workspace", randomUUID(), {
    model: { provider: "test", modelId: "test-model" },
  });
  await harness.waitForIdle(context);
  assert.equal(reviewRead, true);
  const fork = await f.app.inject({
    method: "POST",
    url: `${path}/fork`,
    payload: { at: history.messages[0].entryId, creationId: randomUUID() },
  });
  assert.equal(fork.statusCode, 201, fork.body);
  assert.equal(
    (await f.app.inject(`${base}/${fork.json().id}/configuration`)).json()
      .remote.profile,
    "builder",
  );

  await f.app.close();
  await rm(configPath);
  f = await fixture(directory);
  ({ harness } = await f.service.session(sessionId));
  assert.deepEqual((await configuration()).remote, {
    profile: "builder",
    profiles: [],
    invalid: false,
  });
  await submit("no-fallback.txt");
  await assert.rejects(readFile(join(projectPath, "no-fallback.txt")), {
    code: "ENOENT",
  });
  assert.equal((await change({ remoteProfile: null })).statusCode, 200);
  await submit("local.txt");
  assert.equal(
    await readFile(join(projectPath, "local.txt"), "utf8"),
    "remote result",
  );
});
