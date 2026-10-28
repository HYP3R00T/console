import { randomUUID } from "node:crypto";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FastifyInstance } from "fastify";
import { httpError } from "./providers.ts";

type Backend = { id: string; name: string; url: string; token: string };

// This process is also the browser's hub. Only the hub sees stored remote credentials.
export async function registerBackends(
  app: FastifyInstance,
  directory: string,
  name: () => string,
) {
  const path = join(directory, "backends.sqlite");
  const db = new DatabaseSync(path);
  await chmod(path, 0o600);
  db.exec(
    "CREATE TABLE IF NOT EXISTS backends (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE, token TEXT NOT NULL)",
  );
  app.addHook("onClose", async () => db.close());
  const states = new Map<string, string>();
  function record(id: string) {
    const value = db.prepare("SELECT * FROM backends WHERE id = ?").get(id) as
      | Backend
      | undefined;
    if (!value) throw httpError(404, "Backend connection not found.");
    return value;
  }
  async function request(
    backend: Backend,
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    try {
      const response = await fetch(`${backend.url}/v1${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(35_000),
        headers: {
          authorization: `Bearer ${backend.token}`,
          "x-console-request": "1",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let size = 0;
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.body ?? []) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new Error("Response too large");
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      const data = raw ? JSON.parse(raw) : undefined;
      states.set(backend.id, response.ok ? "online" : "error");
      return { status: response.status, data };
    } catch {
      states.set(backend.id, "offline");
      throw httpError(
        502,
        "Backend unavailable or returned an invalid response. Check its address, token, and server.",
      );
    }
  }
  function validate(input: { name: string; url: string; token: string }) {
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      throw httpError(400, "Enter a valid backend origin.");
    }
    if (!input.name.trim() || !input.token.trim() || /[\r\n]/.test(input.token))
      throw httpError(400, "A name and bearer token are required.");
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw httpError(
        400,
        "Use an origin without credentials, path, query, or fragment.",
      );
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
    )
      throw httpError(
        400,
        "Use HTTPS, or a loopback HTTP origin through an SSH tunnel.",
      );
    return {
      ...input,
      name: input.name.trim(),
      url: url.origin,
      token: input.token.trim(),
    };
  }
  const body = {
    type: "object",
    additionalProperties: false,
    required: ["name", "url", "token"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      url: { type: "string", maxLength: 2000 },
      token: { type: "string", minLength: 1, maxLength: 4096 },
    },
  };
  app.get("/backends", async () => [
    { id: "local", name: name(), local: true, status: "online" },
    ...db
      .prepare("SELECT id, name, url FROM backends ORDER BY name")
      .all()
      .map((row) => ({
        ...row,
        local: false,
        status: states.get(String(row.id)) ?? "unknown",
      })),
  ]);
  app.post<{ Body: { name: string; url: string; token: string } }>(
    "/backends",
    { schema: { body } },
    async (req, reply) => {
      const input = validate(req.body);
      const backend: Backend = { ...input, id: randomUUID() };
      const probe = await request(backend, "/machines");
      if (
        probe.status !== 200 ||
        !Array.isArray(probe.data) ||
        !probe.data[0]?.id
      )
        throw httpError(
          400,
          "Connection failed. Verify the Console backend address and bearer token.",
        );
      const existing = db
        .prepare("SELECT id FROM backends WHERE url = ?")
        .get(input.url);
      if (existing) backend.id = String(existing.id);
      db.prepare(
        "INSERT INTO backends VALUES (?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET name=excluded.name, token=excluded.token",
      ).run(backend.id, backend.name, backend.url, backend.token);
      states.set(backend.id, "online");
      return reply.code(201).send({
        id: backend.id,
        name: backend.name,
        url: backend.url,
        local: false,
        status: "online",
      });
    },
  );
  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/backends/:id",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              pattern: "\\S",
            },
          },
        },
      },
    },
    (req) => {
      record(req.params.id);
      db.prepare("UPDATE backends SET name=? WHERE id=?").run(
        req.body.name.trim(),
        req.params.id,
      );
      return { id: req.params.id, name: req.body.name.trim() };
    },
  );
  app.post<{ Params: { id: string } }>("/backends/:id/check", async (req) => {
    const backend = record(req.params.id);
    const result = await request(backend, "/machines");
    if (result.status !== 200)
      throw httpError(502, "Backend authentication or health check failed.");
    return { status: "online" };
  });
  app.delete<{ Params: { id: string } }>(
    "/backends/:id",
    async (req, reply) => {
      record(req.params.id);
      db.prepare("DELETE FROM backends WHERE id = ?").run(req.params.id);
      states.delete(req.params.id);
      return reply.code(204).send();
    },
  );
  app.route<{ Params: { id: string; "*": string } }>({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    url: "/backends/:id/api/*",
    async handler(req, reply) {
      const tail = req.params["*"];
      if (
        !/^(machines|machine-settings|state|providers|connections|workspaces|sessions|sandbox|trash)(\/|$)/.test(
          tail,
        ) ||
        /[\\%]/.test(tail) ||
        tail.split("/").some((part) => part === "." || part === "..")
      )
        throw httpError(400, "Unsupported backend route.");
      const query = new URL(req.url, "http://localhost").search;
      const result = await request(
        record(req.params.id),
        `/${tail}${query}`,
        req.method,
        req.body,
      );
      return result.status === 204
        ? reply.code(204).send()
        : reply.code(result.status).send(result.data);
    },
  });
}
