import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { openDatabase } from "../storage/database.ts";

declare module "fastify" {
  interface FastifyRequest {
    consoleClientId?: string | null;
  }
}

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class AccessService {
  readonly db;
  private streams = new Map<string, Set<ServerResponse>>();
  private timer: ReturnType<typeof setInterval>;
  private failures = new Map<string, { count: number; until: number }>();
  constructor(path: string) {
    this.db = openDatabase(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS access_invites (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS access_clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, createdAt INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);`);
    this.timer = setInterval(() => {
      for (const id of this.streams.keys()) {
        const active = this.db
          .prepare("SELECT id FROM access_clients WHERE id=? AND revoked=0")
          .get(id);
        if (!active) {
          for (const response of this.streams.get(id) ?? []) response.destroy();
          this.streams.delete(id);
        }
      }
    }, 1000);
    this.timer.unref();
  }
  invite(now = Date.now()) {
    const code = randomBytes(24).toString("base64url");
    this.db.prepare("DELETE FROM access_invites WHERE expires<=?").run(now);
    this.db
      .prepare("INSERT INTO access_invites VALUES (?,?)")
      .run(digest(code), now + 10 * 60000);
    return { code, expiresAt: now + 10 * 60000 };
  }
  pair(code: string, name: string, now = Date.now()) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const invitation = this.db
        .prepare(
          "DELETE FROM access_invites WHERE hash=? AND expires>? RETURNING hash",
        )
        .get(digest(code), now);
      if (!invitation) {
        this.db.exec("ROLLBACK");
        return undefined;
      }
      const id = randomUUID();
      const token = randomBytes(32).toString("base64url");
      this.db
        .prepare(
          "INSERT INTO access_clients (id,name,hash,createdAt) VALUES (?,?,?,?)",
        )
        .run(id, name, digest(token), now);
      this.db.exec("COMMIT");
      return { id, token };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  client(token: string) {
    return this.db
      .prepare("SELECT id FROM access_clients WHERE hash=? AND revoked=0")
      .get(digest(token));
  }
  list() {
    return this.db
      .prepare(
        "SELECT id,name,createdAt,revoked FROM access_clients ORDER BY createdAt DESC",
      )
      .all();
  }
  revoke(id: string) {
    this.db.prepare("UPDATE access_clients SET revoked=1 WHERE id=?").run(id);
    for (const response of this.streams.get(id) ?? []) response.destroy();
    this.streams.delete(id);
  }
  authorize = async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split("?")[0];
    if (
      (request.method === "GET" && path === "/health") ||
      (request.method === "POST" &&
        (path === "/v1/access/pair" ||
          /^\/v1\/hooks\/github\/[a-f0-9-]{36}$/.test(path ?? "")))
    )
      return;
    if (request.method === "OPTIONS") return;
    const header = request.headers.authorization;
    const client =
      typeof header === "string" && header.startsWith("Bearer ")
        ? this.client(header.slice(7))
        : undefined;
    if (!client) {
      await reply
        .code(401)
        .send({ error: "Pair this client with the backend owner." });
      return;
    }
    request.consoleClientId = String(client.id);
    if (path?.endsWith("/events")) {
      const id = String(client.id);
      const streams = this.streams.get(id) ?? new Set<ServerResponse>();
      streams.add(reply.raw);
      this.streams.set(id, streams);
      reply.raw.once("close", () => {
        streams.delete(reply.raw);
        if (!streams.size) this.streams.delete(id);
      });
    }
  };
  register(app: FastifyInstance) {
    app.decorateRequest("consoleClientId", null);
    app.post<{ Body: { code: string; name: string } }>(
      "/v1/access/pair",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["code", "name"],
            properties: {
              code: { type: "string", minLength: 20, maxLength: 100 },
              name: { type: "string", minLength: 1, maxLength: 80 },
            },
          },
        },
      },
      async (request, reply) => {
        const now = Date.now();
        const previous = this.failures.get(request.ip);
        const state =
          previous && previous.until > now
            ? previous
            : { count: 0, until: now + 60000 };
        if (state.count >= 10)
          return reply.code(429).send({
            error: "Too many pairing attempts. Try again in one minute.",
          });
        state.count++;
        if (this.failures.size >= 1000) {
          for (const [ip, entry] of this.failures)
            if (entry.until <= now) this.failures.delete(ip);
          if (this.failures.size >= 1000 && !this.failures.has(request.ip))
            return reply
              .code(429)
              .send({ error: "Pairing is busy. Try again shortly." });
        }
        this.failures.set(request.ip, state);
        const client = this.pair(request.body.code, request.body.name);
        reply.header("Cache-Control", "no-store");
        return (
          client ??
          reply.code(401).send({
            error: "Pairing code is invalid, expired or already used.",
          })
        );
      },
    );
    app.get("/v1/access/clients", async () => ({ clients: this.list() }));
    app.delete<{ Params: { id: string } }>(
      "/v1/access/clients/:id",
      {
        schema: {
          params: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string", format: "uuid" } },
          },
        },
      },
      async (request) => {
        this.revoke(request.params.id);
        return { revoked: true };
      },
    );
  }
  close() {
    clearInterval(this.timer);
    for (const streams of this.streams.values())
      for (const response of streams) response.destroy();
    this.db.close();
  }
}
