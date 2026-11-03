import { chmod, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import type { ProviderService } from "../providers/service.ts";
import { openDatabase } from "../storage/database.ts";

/** One manager owns every open session in this process. Opening is single-flight. */
export class HarnessRuntime {
  private opened = new Map<string, Promise<Harness>>();
  private closing = false;
  private lock?: ReturnType<typeof openDatabase>;
  private directory: string;
  private providers: ProviderService;
  constructor(directory: string, providers: ProviderService) {
    this.directory = directory;
    this.providers = providers;
  }
  open(sessionId: string) {
    if (this.closing) throw new Error("Runtime is closing.");
    let current = this.opened.get(sessionId);
    if (!current) {
      current = this.load(sessionId);
      this.opened.set(sessionId, current);
      void current.then(
        (harness) => {
          void harness.closed.then(() => {
            if (this.opened.get(sessionId) === current)
              this.opened.delete(sessionId);
          });
        },
        () => {},
      );
      void current.catch(() => {
        if (this.opened.get(sessionId) === current)
          this.opened.delete(sessionId);
      });
    }
    return current;
  }
  async claim() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (!this.lock) {
      const lock = openDatabase(join(this.directory, "owner.sqlite"));
      try {
        lock.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
        this.lock = lock;
      } catch (error) {
        lock.close();
        throw error;
      }
    }
  }
  private async load(sessionId: string) {
    await this.claim();
    const path = join(this.directory, `${sessionId}.sqlite`);
    const file = await open(path, "a", 0o600);
    await file.close();
    await chmod(path, 0o600);
    const storage = await openNodeSqliteStorage(path);
    // Recheck enabled state on every generation/compaction, including recovery.
    const models = new Proxy(this.providers.models, {
      get: (target, key) => {
        if (key === "getModel")
          return (provider: string, model: string) =>
            this.providers.store.enabled(provider)
              ? target.getModel(provider, model)
              : undefined;
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      const harness = await Harness.open(
        storage,
        {
          models,
          onReport: (_error, info) => {
            console.warn(
              JSON.stringify({
                event: "durable_report",
                sessionId,
                kind: info.type,
              }),
            );
          },
          registry: createRegistry(), // No filesystem/process tools until an execution policy exists.
          identity: { attribution: null },
          settings: {
            stream: { timeoutMs: 120000, maxRetries: 0 },
            retry: { maxRetries: 1 },
          },
        },
        context,
      );
      return harness;
    } catch (error) {
      await storage.close(context);
      throw error;
    }
  }
  async close() {
    this.closing = true;
    const results = await Promise.allSettled([...this.opened.values()]);
    await Promise.all(
      results.map((result) =>
        result.status === "fulfilled" ? result.value.close(context) : undefined,
      ),
    );
    this.opened.clear();
    this.lock?.close();
  }
}
