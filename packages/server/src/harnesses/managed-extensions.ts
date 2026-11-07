import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as durable from "@earendil-works/pi-durable";
import {
  ConfigurationFileError,
  OwnerConfiguration,
} from "../storage/owner-configuration.ts";

type Selection = { name: string; module: string; sha256: string };
export type ExtensionConfiguration = { extensions: Selection[] };
const moduleName = /^[a-z][a-z0-9-]{0,63}\.mjs$/;
const extensionName = /^user\.[a-z][a-z0-9-]{0,63}$/;
const maximumBytes = 1024 * 1024;

export function parseExtensionConfiguration(
  value: unknown,
): ExtensionConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid extension configuration.");
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).some((key) => key !== "extensions") ||
    !Array.isArray(object.extensions) ||
    object.extensions.length > 32
  )
    throw new Error("Invalid extension configuration.");
  const names = new Set<string>();
  const extensions = object.extensions.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("Invalid extension selection.");
    const entry = item as Record<string, unknown>;
    if (
      Object.keys(entry).some(
        (key) => !["name", "module", "sha256"].includes(key),
      ) ||
      typeof entry.name !== "string" ||
      !extensionName.test(entry.name) ||
      typeof entry.module !== "string" ||
      !moduleName.test(entry.module) ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      names.has(entry.name)
    )
      throw new Error("Invalid extension selection.");
    names.add(entry.name);
    return { name: entry.name, module: entry.module, sha256: entry.sha256 };
  });
  return { extensions };
}

/** Trusted definitions only: modules have the backend process's full privileges. */
export class ManagedExtensions {
  private readonly file: OwnerConfiguration<ExtensionConfiguration>;
  private readonly directory: string;
  private installed: durable.Extension[] = [];
  private active: Selection[] = [];
  private listeners = new Set<() => void>();
  private readers = new Set<durable.RegistryReader>();
  private queue: Promise<unknown> = Promise.resolve();
  private starting?: Promise<void>;
  private problem?: string;

  constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, "extensions");
    this.file = new OwnerConfiguration(
      join(dataDirectory, "extensions.json"),
      parseExtensionConfiguration,
      { extensions: [] },
    );
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  start() {
    this.starting ??= this.serialize(async () => {
      try {
        const snapshot = await this.file.read();
        if (!snapshot.configuration) throw new Error("Invalid manifest");
        this.publish(
          await this.prepare(snapshot.configuration),
          snapshot.configuration.extensions,
        );
      } catch {
        // Keep the Harness available to diagnose blocked tasks and restore definitions.
        this.problem =
          "Managed extensions could not load. Restore the pinned owner-only bundles and reload, or save a valid replacement.";
      }
    });
    return this.starting;
  }

  async configuration() {
    await this.start();
    return { ...(await this.file.read()), ...this.status() };
  }

  status() {
    return {
      installed: this.installed.map((extension) => ({
        ...this.active.find((selection) => selection.name === extension.name),
        name: extension.name,
        tasks: (extension.tasks ?? []).map((task) => ({
          name: task.definition.name,
          version: task.definition.version,
        })),
        tools: (extension.tools ?? []).map((tool) => tool.name),
      })),
      ...(this.problem && { problem: this.problem }),
    };
  }

  async candidates() {
    try {
      await this.checkDirectory();
    } catch {
      return {
        modules: [],
        problem:
          "Create an owner-only extensions directory in the backend data directory and provision trusted .mjs bundles there.",
      };
    }
    const names = (await readdir(this.directory))
      .filter((name) => moduleName.test(name))
      .sort();
    const modules = [];
    for (const name of names.slice(0, 128)) {
      try {
        const bytes = await this.readModule(name);
        modules.push({ module: name, sha256: this.digest(bytes) });
      } catch {
        modules.push({ module: name, unavailable: true as const });
      }
    }
    return { modules, truncated: names.length > 128 };
  }

  async updateConfiguration(revision: string, value: unknown) {
    await this.start();
    return this.serialize(async () => {
      if ((await this.file.read()).revision !== revision)
        throw new ConfigurationFileError(
          409,
          "Configuration changed. Reload before saving.",
        );
      let configuration: ExtensionConfiguration;
      try {
        configuration = parseExtensionConfiguration(value);
      } catch {
        throw new ConfigurationFileError(
          400,
          "Invalid extension configuration. Use unique user.* names, .mjs filenames and SHA-256 digests.",
        );
      }
      const extensions = await this.prepare(configuration);
      await this.file.replace(revision, configuration, async () =>
        this.publish(extensions, configuration.extensions),
      );
      return { ...(await this.file.read()), ...this.status() };
    });
  }

  async reload() {
    await this.start();
    return this.serialize(async () => {
      const snapshot = await this.file.read();
      if (!snapshot.configuration)
        throw new ConfigurationFileError(
          400,
          "Repair the malformed extension manifest before reloading.",
        );
      // A failed replacement leaves the last known definitions active in this process.
      this.publish(
        await this.prepare(snapshot.configuration),
        snapshot.configuration.extensions,
      );
      return { ...snapshot, ...this.status() };
    });
  }

  /** Each publication is one immutable registry snapshot, never a half-replaced set. */
  attach(base: durable.RegistryReader) {
    let snapshot = this.compose(base, this.installed);
    const listeners = new Set<() => void>();
    const refresh = () => {
      snapshot = this.compose(base, this.installed);
      for (const listener of listeners) listener();
    };
    this.readers.add(base);
    this.listeners.add(refresh);
    const unsubscribe = base.subscribe(refresh);
    return {
      reader: {
        snapshot: () => snapshot,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      } satisfies durable.RegistryReader,
      close: () => {
        unsubscribe();
        this.readers.delete(base);
        this.listeners.delete(refresh);
        listeners.clear();
      },
    };
  }

  private compose(
    base: durable.RegistryReader,
    extensions: durable.Extension[],
  ) {
    const registry = durable.createRegistry();
    for (const extension of base.snapshot().installed())
      registry.install(extension);
    for (const extension of extensions) registry.install(extension);
    return registry.snapshot();
  }

  private publish(extensions: durable.Extension[], selections: Selection[]) {
    this.installed = extensions;
    this.active = structuredClone(selections);
    this.problem = undefined;
    for (const listener of this.listeners) listener();
  }

  private digest(bytes: Buffer) {
    return createHash("sha256").update(bytes).digest("hex");
  }

  private async checkDirectory() {
    const info = await lstat(this.directory);
    if (
      !info.isDirectory() ||
      (process.getuid &&
        (info.uid !== process.getuid() || (info.mode & 0o077) !== 0))
    )
      throw new Error("Unsafe extension directory");
  }

  private async readModule(name: string) {
    await this.checkDirectory();
    const file = await open(
      join(this.directory, name),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await file.stat();
      if (
        !info.isFile() ||
        info.size > maximumBytes ||
        (process.getuid &&
          (info.uid !== process.getuid() || (info.mode & 0o077) !== 0))
      )
        throw new Error("Unsafe extension bundle");
      const buffer = Buffer.alloc(maximumBytes + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          offset,
          buffer.length - offset,
          null,
        );
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset > maximumBytes) throw new Error("Extension bundle too large");
      return buffer.subarray(0, offset);
    } finally {
      await file.close();
    }
  }

  private async prepare(configuration: ExtensionConfiguration) {
    const extensions: durable.Extension[] = [];
    const registry = durable.createRegistry();
    for (const selection of configuration.extensions) {
      try {
        const bytes = await this.readModule(selection.module);
        if (this.digest(bytes) !== selection.sha256)
          throw new Error("Digest changed");
        // Execute exactly the verified bytes, not a mutable file path. Bundles are self-contained.
        const module = await import(
          `data:text/javascript;base64,${bytes.toString("base64")}`
        );
        if (typeof module.default !== "function")
          throw new Error("Missing factory");
        const extension: durable.Extension = await module.default(durable);
        const toolPrefix = `user_${selection.name.slice(5).replaceAll("-", "_")}_`;
        if (
          !extension ||
          extension.name !== selection.name ||
          (extension.tools ?? []).some(
            (tool) =>
              !tool.name.startsWith(toolPrefix) ||
              !/^user_[a-z0-9_]{1,59}$/.test(tool.name),
          ) ||
          (extension.tasks ?? []).some(
            (task) => !task.definition.name.startsWith(`${selection.name}.`),
          )
        )
          throw new Error("Unstable or reserved identity");
        registry.install(extension);
        extensions.push(extension);
      } catch {
        throw new ConfigurationFileError(
          400,
          `Cannot load ${selection.name}. Check its owner-only bundle, digest, factory and namespaced tool/task definitions.`,
        );
      }
    }
    for (const base of this.readers) this.compose(base, extensions);
    return extensions;
  }
}
