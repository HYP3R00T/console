import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export class ConfigurationFileError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const limit = 64 * 1024;
export type ConfigurationSnapshot<T> = {
  revision: string;
  configuration: T | null;
  invalid: boolean;
};

/** Owner-only, bounded files shared with the owner's manual configuration workflow. */
export class OwnerConfiguration<T> {
  private queue: Promise<unknown> = Promise.resolve();
  private path: string;
  private parse: (value: unknown) => T;
  private empty: T;
  constructor(path: string, parse: (value: unknown) => T, empty: T) {
    this.path = path;
    this.parse = parse;
    this.empty = empty;
  }

  async read(): Promise<ConfigurationSnapshot<T>> {
    let file: Awaited<ReturnType<typeof open>>;
    try {
      file = await open(
        this.path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return {
          revision: "missing",
          configuration: structuredClone(this.empty),
          invalid: false,
        };
      throw new ConfigurationFileError(
        400,
        "Configuration must be an owner-only regular file, not a link.",
      );
    }
    let bytes: Buffer;
    try {
      const info = await file.stat();
      if (
        !info.isFile() ||
        info.size > limit ||
        (process.getuid &&
          (info.uid !== process.getuid() || (info.mode & 0o077) !== 0))
      )
        throw new ConfigurationFileError(
          400,
          "Configuration must be an owner-only regular file of at most 64 KiB.",
        );
      const buffer = Buffer.alloc(limit + 1);
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
      if (offset > limit)
        throw new ConfigurationFileError(400, "Configuration exceeds 64 KiB.");
      bytes = buffer.subarray(0, offset);
    } finally {
      await file.close();
    }
    const revision = createHash("sha256").update(bytes).digest("hex");
    try {
      return {
        revision,
        configuration: this.parse(JSON.parse(bytes.toString("utf8"))),
        invalid: false,
      };
    } catch {
      return { revision, configuration: null, invalid: true };
    }
  }

  replace(revision: string, value: unknown, activate: () => Promise<unknown>) {
    const next = this.queue.then(async () => {
      let configuration: T;
      try {
        configuration = this.parse(value);
      } catch {
        throw new ConfigurationFileError(
          400,
          "Invalid configuration. Check required fields, names, paths and limits.",
        );
      }
      const bytes = Buffer.from(`${JSON.stringify(configuration, null, 2)}\n`);
      if (bytes.length > limit)
        throw new ConfigurationFileError(400, "Configuration exceeds 64 KiB.");
      const current = await this.read();
      if (current.revision !== revision)
        throw new ConfigurationFileError(
          409,
          "Configuration changed. Reload before saving.",
        );
      const temporary = join(
        dirname(this.path),
        `.console-config-${randomUUID()}.tmp`,
      );
      try {
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(bytes);
          await file.sync();
        } finally {
          await file.close();
        }
        // Detect owner edits made while the replacement was being prepared.
        if ((await this.read()).revision !== revision)
          throw new ConfigurationFileError(
            409,
            "Configuration changed. Reload before saving.",
          );
        await rename(temporary, this.path);
        const directory = await open(dirname(this.path), constants.O_RDONLY);
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      } finally {
        await rm(temporary, { force: true });
      }
      await activate();
      return this.read();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}
