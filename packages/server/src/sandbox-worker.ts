// This process is exec'd by nono AFTER kernel restrictions have been installed.

import { createSocket } from "node:dgram";
import {
  closeSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";

const limit = 64 * 1024;
type Request = {
  operation: "check" | "read" | "write" | "fetch" | "probe-network";
  path?: string;
  content?: string;
  url?: string;
  port?: number;
  protocol?: "tcp" | "udp";
};
async function execute(request: Request) {
  if (request.operation === "check") {
    statSync(process.cwd());
    return "Sandbox applied";
  }
  if (request.operation === "read") {
    const fd = openSync(resolve(request.path ?? ""), "r");
    try {
      const buffer = Buffer.alloc(limit + 1);
      const size = readSync(fd, buffer);
      if (size > limit) throw new Error("File exceeds 64 KiB limit");
      return buffer.subarray(0, size).toString("utf8");
    } finally {
      closeSync(fd);
    }
  }
  if (request.operation === "write") {
    const content = request.content ?? "";
    if (Buffer.byteLength(content) > limit)
      throw new Error("Content exceeds 64 KiB limit");
    writeFileSync(resolve(request.path ?? ""), content);
    return "File written";
  }
  if (request.operation === "fetch") {
    const url = new URL(request.url ?? "");
    if (!["https:", "http:"].includes(url.protocol))
      throw new Error("Only HTTP(S) URLs are supported");
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let output = "";
    let size = 0;
    const decoder = new TextDecoder();
    for await (const chunk of response.body ?? []) {
      size += chunk.length;
      if (size > limit) throw new Error("Response exceeds 64 KiB limit");
      output += decoder.decode(chunk, { stream: true });
    }
    return output + decoder.decode();
  }
  if (request.operation === "probe-network") {
    const port = request.port;
    if (
      port === undefined ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    )
      throw new Error("Invalid probe port");
    // Test-only socket probes: these are never registered as agent tools or HTTP routes.
    return new Promise<string>((accept, reject) => {
      if (request.protocol === "udp") {
        const socket = createSocket("udp4");
        let finished = false;
        function finish(error?: Error | null) {
          if (finished) return;
          finished = true;
          try {
            socket.close();
          } catch {
            /* Socket creation itself may have been denied. */
          }
          error ? reject(error) : accept("connected");
        }
        socket.once("error", finish);
        socket.send("probe", port, "127.0.0.1", finish);
      } else {
        const socket = connect({ host: "127.0.0.1", port });
        socket.once("error", reject);
        socket.once("connect", () => {
          socket.destroy();
          accept("connected");
        });
      }
    });
  }
  throw new Error("Unknown sandbox operation");
}

try {
  const request = JSON.parse(readFileSync(0, "utf8")) as Request;
  console.log(JSON.stringify({ output: await execute(request) }));
} catch (error) {
  const code =
    error instanceof Error && "code" in error ? error.code : "operation_failed";
  console.log(JSON.stringify({ error: String(code) }));
  process.exitCode = 1;
}
