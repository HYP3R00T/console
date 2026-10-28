import { type NextRequest, NextResponse } from "next/server";

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(request.nextUrl.hostname))
    return NextResponse.json(
      { message: "Console web client is local-only." },
      { status: 403 },
    );
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("x-console-request") !== "1"
  )
    return NextResponse.json(
      { message: "Use the Console client." },
      { status: 403 },
    );
  const { path } = await context.params;
  if (path.some((part) => /[\\/%]/.test(part) || part === "." || part === ".."))
    return NextResponse.json({ message: "Invalid route." }, { status: 400 });
  const origin = process.env.CONSOLE_API_URL ?? "http://127.0.0.1:3000";
  try {
    const response = await fetch(
      `${origin.replace(/\/$/, "")}/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
      {
        method: request.method,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(40_000),
        headers: {
          "x-console-request": "1",
          ...(process.env.CONSOLE_ACCESS_TOKEN
            ? { authorization: `Bearer ${process.env.CONSOLE_ACCESS_TOKEN}` }
            : {}),
          ...(request.headers.has("content-type")
            ? { "content-type": "application/json" }
            : {}),
        },
        body: ["GET", "HEAD"].includes(request.method)
          ? undefined
          : await request.text(),
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Backend unavailable." },
      { status: 502 },
    );
  }
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
