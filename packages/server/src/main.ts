import { createApp } from "./app.ts";

const app = createApp({ logger: true });
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    void app.close().catch((error: unknown) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: "127.0.0.1", port: 3000 });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
