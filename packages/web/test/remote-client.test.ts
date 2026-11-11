import assert from "node:assert/strict";
import test from "node:test";
import { clearBackendToken, pairBackend } from "../src/lib/backend/auth.ts";
import { localHttpConnector } from "../src/lib/backend/local-http.ts";

const identity = {
  product: "console",
  apiVersion: 1,
  backendId: "11111111-1111-4111-8111-111111111111",
};
test("remote pairing keeps credentials origin-scoped and authenticates requests and streamed events", async (t) => {
  const origin = "https://remote.example";
  t.after(() => clearBackendToken(origin));
  const requests: { url: string; init: RequestInit }[] = [];
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    if (url.endsWith("/pair"))
      return Response.json({ id: "client", token: "test-access-token" });
    if (url.endsWith("/events"))
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
            controller.enqueue(
              new TextEncoder().encode("event: snapshot\r\ndata: first\r\n"),
            );
            controller.enqueue(
              new TextEncoder().encode("data: second\r\n\r\n"),
            );
          },
          cancel() {
            stream = undefined;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    return Response.json(identity);
  });
  await pairBackend(origin, "a-pairing-code-with-enough-length", "browser");
  assert.equal(
    new Headers(requests[0].init.headers).get("Authorization"),
    null,
  );
  const client = await localHttpConnector.open(
    origin,
    new AbortController().signal,
  );
  t.after(() => client.close());
  await client.request("/v1/projects");
  for (const request of requests.slice(1))
    assert.equal(
      new Headers(request.init.headers).get("Authorization"),
      "Bearer test-access-token",
    );
  const received: string[] = [];
  const close = client.subscribe("/v1/conversations/events", "snapshot", {
    message: (data) => received.push(data),
    reconnecting: () => {},
  });
  for (let i = 0; i < 20 && !received.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(received, ["first\nsecond"]);
  assert.equal(
    new Headers(requests.at(-1)?.init.headers).get("Authorization"),
    "Bearer test-access-token",
  );
  const length = requests.length;
  await assert.rejects(
    client.request("https://elsewhere.example/api"),
    /connected backend/,
  );
  assert.equal(requests.length, length);
  close();
  stream?.enqueue(new TextEncoder().encode("event: snapshot\ndata: late\n\n"));
  assert.deepEqual(received, ["first\nsecond"]);
  await localHttpConnector
    .open("https://other.example", new AbortController().signal)
    .then((other) => other.close());
  assert.equal(
    new Headers(requests.at(-1)?.init.headers).get("Authorization"),
    null,
  );
});
