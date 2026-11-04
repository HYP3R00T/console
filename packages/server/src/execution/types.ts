/** Host-owned scope; never take the root directory from model arguments. */
export type ProjectScope = { id: string; name: string; directory: string };
export type Inspection =
  | { kind: "list"; path: string }
  | { kind: "read"; path: string; offset: number; limit: number }
  | { kind: "search"; path: string; query: string };

/** Application boundary for a future worker/sandbox adapter. No shell or writes yet. */
export interface ProjectExecutor {
  readonly isolation: "none" | "os";
  inspect(
    scope: ProjectScope,
    operation: Inspection,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

export class ExecutionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
