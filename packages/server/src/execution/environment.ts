import type { ExecutionEnv } from "@earendil-works/pi-durable/env";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";

/** Host-owned environment factory for Durable's bundled coding tools. */
export type ExecutionEnvironmentFactory = (
  cwd: string,
) => ExecutionEnv | Promise<ExecutionEnv>;

export const localEnvironment: ExecutionEnvironmentFactory = (cwd) =>
  new NodeExecutionEnv({ cwd });
