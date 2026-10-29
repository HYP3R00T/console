import { type NextRequest, NextResponse } from "next/server";
import { ConnectionError, machineStore } from "@/lib/server/machine-store";
import type { SshConfig } from "@/lib/server/ssh-tunnel";
export const runtime = "nodejs";

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(request.nextUrl.hostname))
    return NextResponse.json(
      { message: "Console web client is local-only." },
      { status: 403 },
    );
  if (
    request.method !== "GET" &&
    request.headers.get("x-console-request") !== "1"
  )
    return NextResponse.json(
      { message: "Use the Console client." },
      { status: 403 },
    );
  try {
    const path = (await context.params).path ?? [];
    if (
      path.some((part) => /[\\/%]/.test(part) || part === "." || part === "..")
    )
      throw new ConnectionError(400, "Invalid machine route.");
    const raw = request.method === "GET" ? "" : await request.text();
    if (raw.length > 256 * 1024)
      throw new ConnectionError(413, "Request too large.");
    let body: Record<string, unknown> | undefined;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      throw new ConnectionError(400, "Invalid JSON request.");
    }
    const store = machineStore();
    if (!path.length) {
      if (request.method === "GET") return NextResponse.json(store.list());
      if (request.method === "POST") {
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new ConnectionError(400, "Enter connection details.");
        return NextResponse.json(
          await store.connect({
            url: body.url as string,
            name: body.name as string | undefined,
            token: body.token as string | undefined,
            ssh: body.ssh as SshConfig | undefined,
          }),
          { status: 201 },
        );
      }
    }
    if (path.length === 1) {
      if (path[0] === "history" && request.method === "GET")
        return NextResponse.json(store.recent());
      if (path[0] === "preferences" && request.method === "GET")
        return NextResponse.json(store.preferences());
      if (path[0] === "preferences" && request.method === "PATCH")
        return NextResponse.json(
          store.savePreferences(
            body as { models: string[]; thinkingLevels: string[] },
          ),
        );
      if (path[0] === "detect-local" && request.method === "POST")
        return NextResponse.json(await store.detectLocal());
    }
    if (
      path.length === 2 &&
      path[1] === "reconnect" &&
      request.method === "POST"
    )
      return NextResponse.json(
        await store.reconnect(path[0], body?.token as string | undefined),
      );
    if (
      path.length === 2 &&
      path[1] === "forget" &&
      request.method === "DELETE"
    ) {
      store.forget(path[0]);
      return new Response(null, { status: 204 });
    }
    const id = path[0];
    if (id && path.length === 1) {
      if (request.method === "DELETE") {
        await store.disconnect(id);
        return new Response(null, { status: 204 });
      }
      if (request.method === "PATCH")
        return NextResponse.json(store.rename(id, body?.name as string));
    }
    if (
      id &&
      path.length === 2 &&
      path[1] === "check" &&
      request.method === "POST"
    )
      return NextResponse.json(await store.check(id));
    if (id && path[1] === "api" && path.length > 2) {
      const result = await store.proxy(
        id,
        `${path.slice(2).join("/")}${request.nextUrl.search}`,
        request.method,
        body,
      );
      return result.status === 204
        ? new Response(null, { status: 204 })
        : NextResponse.json(result.data, { status: result.status });
    }
    throw new ConnectionError(404, "Unknown machine operation.");
  } catch (cause) {
    return NextResponse.json(
      {
        message:
          cause instanceof ConnectionError
            ? cause.message
            : "Connection operation failed. Check the web server's local storage.",
      },
      { status: cause instanceof ConnectionError ? cause.status : 500 },
    );
  }
}

export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as PUT,
  handle as DELETE,
};
