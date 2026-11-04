import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type {
  BackendClient,
  BackendConnector,
} from "../src/lib/backend/client.ts";
import { ConnectionManager } from "../src/lib/backend/connection-manager.ts";
import { localHttpConnector } from "../src/lib/backend/local-http.ts";

const one = "11111111-1111-4111-8111-111111111111";
const two = "22222222-2222-4222-8222-222222222222";
async function server(identity: string) {
  const app = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify(
        request.url === "/v1/connection"
          ? { product: "console", apiVersion: 1, backendId: identity }
          : { identity },
      ),
    );
  });
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const address = app.address();
  if (!address || typeof address === "string")
    throw new Error("No test address");
  return {
    app,
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        app.closeAllConnections();
        app.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("two real backend endpoints stay independently connected and route requests correctly", async (t) => {
  const a = await server(one);
  const b = await server(two);
  const manager = new ConnectionManager(localHttpConnector);
  class Events extends EventTarget {
    static instances: Events[] = [];
    closed = false;
    onerror?: () => void;
    constructor(_url: string) {
      super();
      Events.instances.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
  Object.defineProperty(globalThis, "EventSource", {
    value: Events,
    configurable: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "EventSource", previous);
    else Reflect.deleteProperty(globalThis, "EventSource");
  });
  t.after(async () => {
    manager.close();
    await a.close();
    await b.close();
  });
  assert.deepEqual(
    await Promise.all([
      manager.connect("a", a.origin),
      manager.connect("b", b.origin),
    ]),
    [true, true],
  );
  const first = manager.snapshot().a.client;
  const second = manager.snapshot().b.client;
  assert.ok(first && second);
  assert.deepEqual(await first.request("/v1/projects"), { identity: one });
  assert.deepEqual(await second.request("/v1/projects"), { identity: two });
  const received: string[] = [];
  first.subscribe("/v1/events", "snapshot", {
    message: (data) => received.push(`a:${data}`),
    reconnecting: () => {},
  });
  second.subscribe("/v1/events", "snapshot", {
    message: (data) => received.push(`b:${data}`),
    reconnecting: () => {},
  });
  manager.disconnect("a");
  assert.equal(Events.instances[0].closed, true);
  assert.equal(Events.instances[1].closed, false);
  Events.instances[0].dispatchEvent(
    new MessageEvent("snapshot", { data: "late" }),
  );
  Events.instances[1].dispatchEvent(
    new MessageEvent("snapshot", { data: "live" }),
  );
  assert.deepEqual(received, ["b:live"]);
  assert.equal(manager.snapshot().a.status, "disconnected");
  await assert.rejects(first.request("/v1/projects"), /ended/);
  assert.equal(manager.snapshot().b.client, second);
  assert.deepEqual(await second.request("/v1/projects"), { identity: two });
  assert.equal(
    await manager.connect(
      "alias",
      a.origin.replace("127.0.0.1", "localhost"),
      two,
    ),
    false,
  );
  assert.match(manager.snapshot().alias.error ?? "", /identity changed/);
  assert.equal(await manager.connect("a", a.origin, one), true);
  assert.equal(await manager.connect("alias", a.origin), false);
  assert.match(manager.snapshot().alias.error ?? "", /already connected/);
  assert.equal(manager.snapshot().a.status, "connected");
});

function client(
  origin: string,
  backendId: string,
  probe: BackendClient["probe"],
): BackendClient & { closed: boolean } {
  const value = {
    origin,
    backendId,
    closed: false,
    probe,
    request: async <T>() => ({ origin }) as T,
    subscribe: () => () => {},
    close: () => {
      value.closed = true;
    },
  };
  return value;
}

test("cancelled and superseded connects cannot publish late clients", async () => {
  const pending: ((value: BackendClient) => void)[] = [];
  const connector: BackendConnector = {
    open: () => new Promise((resolve) => pending.push(resolve)),
  };
  const manager = new ConnectionManager(connector);
  const first = manager.connect("a", "http://localhost:3000");
  manager.disconnect("a");
  const old = client("http://localhost:3000", one, async () => ({
    origin: "http://localhost:3000",
    backendId: one,
    checkedAt: Date.now(),
  }));
  pending.shift()?.(old);
  assert.equal(await first, false);
  assert.equal(old.closed, true);
  const second = manager.connect("a", old.origin);
  const third = manager.connect("a", old.origin);
  const stale = {
    ...old,
    closed: false,
    close() {
      this.closed = true;
    },
  };
  pending.shift()?.(stale);
  assert.equal(await second, false);
  assert.equal(stale.closed, true);
  const current = {
    ...old,
    closed: false,
    close() {
      this.closed = true;
    },
  };
  pending.shift()?.(current);
  assert.equal(await third, true);
  assert.equal(manager.snapshot().a.client, current);
  manager.close();
  assert.equal(current.closed, true);
});

test("health failure and changed identity affect only the owning machine", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const a = client("http://localhost:3000", one, async () => {
    throw new Error("Backend unavailable");
  });
  const b = client("http://localhost:4000", two, async () => ({
    origin: "http://localhost:4000",
    backendId: two,
    checkedAt: Date.now(),
  }));
  const manager = new ConnectionManager(
    { open: async (address) => (address === a.origin ? a : b) },
    5,
  );
  t.after(() => manager.close());
  await manager.connect("a", a.origin);
  await manager.connect("b", b.origin);
  t.mock.timers.tick(5);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(manager.snapshot().a.status, "error");
  assert.equal(a.closed, true);
  assert.equal(manager.snapshot().b.status, "connected");
  assert.equal(b.closed, false);
  b.probe = async () => ({
    origin: b.origin,
    backendId: one,
    checkedAt: Date.now(),
  });
  t.mock.timers.tick(5);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(manager.snapshot().b.status, "error");
  assert.match(manager.snapshot().b.error ?? "", /identity changed/);
});
