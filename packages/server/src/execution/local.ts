import { constants } from "node:fs";
import { open, opendir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  ExecutionError,
  type Inspection,
  type ProjectExecutor,
  type ProjectScope,
} from "./types.ts";

const maxBytes = 256 * 1024;
const ignored = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "target",
  ".venv",
]);
const inside = (root: string, path: string) => {
  const value = relative(root, path);
  return value !== ".." && !value.startsWith("../") && !isAbsolute(value);
};

/** Read-only local I/O with application path checks. NOT an OS sandbox or race-proof confinement. */
export class LocalProjectExecutor implements ProjectExecutor {
  readonly isolation = "none";
  async inspect(
    scope: ProjectScope,
    operation: Inspection,
    signal?: AbortSignal,
  ) {
    const deadline = Date.now() + 5000;
    const check = () => {
      signal?.throwIfAborted();
      if (Date.now() > deadline)
        throw new ExecutionError(
          "limit_reached",
          "Inspection exceeded its time budget.",
        );
    };
    try {
      check();
      const root = await realpath(scope.directory);
      const target = resolve(root, operation.path);
      if (!inside(root, target))
        throw new ExecutionError(
          "outside_project",
          "Path is outside this project.",
        );
      const canonical = await realpath(target);
      if (!inside(root, canonical))
        throw new ExecutionError(
          "outside_project",
          "Symlink points outside this project.",
        );
      check();
      if (operation.kind === "list") {
        const entries: { name: string; kind: string }[] = [];
        let truncated = false;
        for await (const item of await opendir(canonical)) {
          check();
          if (entries.length === 200) {
            truncated = true;
            break;
          }
          entries.push({
            name: item.name,
            kind: item.isSymbolicLink()
              ? "symlink"
              : item.isDirectory()
                ? "directory"
                : item.isFile()
                  ? "file"
                  : "other",
          });
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        return { path: operation.path, entries, truncated };
      }
      const read = async (path: string) => {
        check();
        // Avoid blocking on FIFOs/devices; check the opened object before reading.
        const file = await open(
          path,
          constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
        );
        try {
          if (!(await file.stat()).isFile())
            throw new ExecutionError(
              "not_file",
              "Expected a regular text file.",
            );
          const buffer = Buffer.alloc(maxBytes + 1);
          let length = 0;
          while (length < buffer.length) {
            check();
            const chunk = await file.read(
              buffer,
              length,
              buffer.length - length,
              null,
            );
            if (!chunk.bytesRead) break;
            length += chunk.bytesRead;
          }
          check();
          if (buffer.subarray(0, length).includes(0))
            throw new ExecutionError(
              "binary_file",
              "Binary files are not supported.",
            );
          return {
            text: buffer
              .subarray(0, Math.min(length, maxBytes))
              .toString("utf8"),
            truncated: length > maxBytes,
            bytes: length,
          };
        } finally {
          await file.close();
        }
      };
      if (operation.kind === "read") {
        const data = await read(canonical);
        const lines = data.text.split("\n");
        if (operation.offset > lines.length)
          throw new ExecutionError(
            "offset_out_of_range",
            data.truncated
              ? "Requested line is outside the bounded file preview (256 KiB)."
              : "Requested line is beyond the end of the file.",
          );
        const selected = lines.slice(
          operation.offset - 1,
          operation.offset - 1 + operation.limit,
        );
        const text = selected
          .map((line, i) => `${operation.offset + i}: ${line}`)
          .join("\n");
        const truncated =
          data.truncated ||
          operation.offset - 1 + selected.length < lines.length ||
          text.length > 16000;
        return {
          path: operation.path,
          offset: operation.offset,
          text: text.slice(0, 16000),
          truncated,
          ...(truncated
            ? { note: "Bounded preview; file content may be incomplete." }
            : {}),
        };
      }
      const matches: { path: string; line: number; text: string }[] = [];
      let visited = 0;
      let bytes = 0;
      let skipped = 0;
      let truncated = false;
      const queue = [canonical];
      while (queue.length && !truncated) {
        check();
        const directory = queue.shift();
        if (!directory) break;
        for await (const entry of await opendir(directory)) {
          check();
          if (
            ++visited > 1000 ||
            bytes >= 4 * 1024 * 1024 ||
            matches.length >= 100
          ) {
            truncated = true;
            break;
          }
          const path = resolve(directory, entry.name);
          if (entry.isSymbolicLink() || ignored.has(entry.name)) {
            skipped++;
            continue;
          }
          if (entry.isDirectory()) {
            queue.push(path);
            continue;
          }
          if (!entry.isFile()) {
            skipped++;
            continue;
          }
          try {
            // Recheck canonical scope for every discovered file.
            if (!inside(root, await realpath(path))) {
              skipped++;
              continue;
            }
            const data = await read(path);
            bytes += data.bytes;
            if (data.truncated) skipped++;
            const lines = data.text.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i] ?? "";
              if (!line.includes(operation.query)) continue;
              matches.push({
                path: relative(root, path),
                line: i + 1,
                text: line.slice(0, 240),
              });
              if (matches.length === 100) {
                truncated = true;
                break;
              }
            }
          } catch (error) {
            if (
              signal?.aborted ||
              (error instanceof ExecutionError &&
                error.code === "limit_reached")
            )
              throw error;
            skipped++;
          }
        }
      }
      return {
        matches,
        truncated,
        skipped,
        note: "Literal case-sensitive search; symlinks, generated/dependency folders, binary and inaccessible files are skipped. Files are read up to 256 KiB.",
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof ExecutionError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT")
        throw new ExecutionError(
          "not_found",
          "File or directory was not found.",
        );
      if (code === "EACCES" || code === "EPERM")
        throw new ExecutionError(
          "permission_denied",
          "Operating system denied access.",
        );
      if (code === "ENOTDIR")
        throw new ExecutionError("not_directory", "Expected a directory.");
      throw new ExecutionError(
        "execution_failed",
        "Project inspection failed.",
      );
    }
  }
}
