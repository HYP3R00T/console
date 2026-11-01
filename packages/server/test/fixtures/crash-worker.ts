import { join } from "node:path";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import { createApp } from "../../src/app.ts";

const root = process.argv[2];
const faux = fauxProvider({ tokensPerSecond: 1 });
const models = createModels();
models.setProvider(faux.provider);
const app = createApp(
  {},
  {
    dataDirectory: join(root, "data"),
    providerId: faux.provider.id,
    models: () => models,
  },
);
const headers = { "x-console-request": "1" };
const project = (
  await app.inject({
    method: "POST",
    url: "/v1/projects",
    headers,
    payload: {
      name: "Crash",
      path: join(root, "project"),
      requestId: "project",
    },
  })
).json();
const session = (
  await app.inject({
    method: "POST",
    url: `/v1/projects/${project.id}/sessions`,
    headers,
    payload: { name: "Work", requestId: "work" },
  })
).json();
await app.inject({
  method: "PATCH",
  url: `/v1/sessions/${session.id}/config`,
  headers,
  payload: { model: faux.getModel().id },
});
faux.setResponses([
  fauxAssistantMessage(
    "This intentionally long answer is interrupted by a process kill",
  ),
]);
await app.inject({
  method: "POST",
  url: `/v1/sessions/${session.id}/messages`,
  headers,
  payload: { text: "Start", requestId: "start" },
});
for (;;) {
  const state = (await app.inject(`/v1/sessions/${session.id}`)).json();
  if (state.partial) {
    process.stdout.write(
      `${JSON.stringify({ id: session.id, projectId: project.id })}\n`,
    );
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
}
setInterval(() => {}, 1000);
