import { createApp } from "./app.ts";

const app = createApp({ logger: true });
let stopping = false;

async function shutdown(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, "Stopping server");

  try {
    await app.close();
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  const rawPort = process.env.PORT ?? "3000";
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(port) || port > 65535) {
    throw new Error("PORT must be an integer between 0 and 65535");
  }

  const address = await app.listen({
    host: process.env.HOST ?? "127.0.0.1",
    port,
  });
  app.log.info(
    {
      connectionUrl: address
        .replace("0.0.0.0", "127.0.0.1")
        .replace("[::]", "[::1]"),
      apiVersion: 1,
      authentication: process.env.CONSOLE_ACCESS_TOKEN
        ? "access token required"
        : "loopback only; token not required",
    },
    "Connect this machine from Console > Machines. Nothing is discovered automatically.",
  );
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
