import { createApp } from "./app.ts";
import { startupArguments } from "./platform/configuration.ts";

async function main() {
  const options = startupArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      "Console backend\n\nStart: node dist/main.js [--port 3000] [--data-dir /absolute/path]\n\nDefaults: loopback 127.0.0.1:3000, storage ~/.local/share/console.\nNo environment file or configuration file is required.\n",
    );
    return;
  }
  const app = createApp({ logger: true }, { dataDirectory: options.directory });
  let stopping = false;
  async function shutdown(signal: NodeJS.Signals) {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, "Stopping server");
    try {
      await app.close();
    } catch {
      app.log.error("Server shutdown failed");
      process.exitCode = 1;
    }
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    const address = await app.listen({ host: "127.0.0.1", port: options.port });
    app.log.info(
      { address, directory: options.directory, apiVersion: 1 },
      "Console backend ready",
    );
  } catch {
    app.log.error(
      "Cannot start Console. Check the port and data-directory permissions.",
    );
    process.exitCode = 1;
    await app.close();
  }
}
main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Console startup failed."}\n`,
  );
  process.exitCode = 1;
});
