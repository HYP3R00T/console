import type { WorkflowStep } from "@console/contracts";

type Merge = NonNullable<Extract<WorkflowStep, { type: "approval" }>["merge"]>;
export class GitHubActions {
  private token: () => string | undefined;
  private fetcher: typeof fetch;
  constructor(token = () => process.env.CONSOLE_GITHUB_TOKEN, fetcher = fetch) {
    this.token = token;
    this.fetcher = fetcher;
  }
  private async request(
    action: Merge,
    method: "GET" | "PUT",
    signal?: AbortSignal,
  ) {
    const token = this.token();
    if (!token)
      throw new Error(
        "Configure CONSOLE_GITHUB_TOKEN on the backend before merging.",
      );
    if (
      !/^[a-zA-Z0-9_.-]+$/.test(action.owner) ||
      !/^[a-zA-Z0-9_.-]+$/.test(action.repository) ||
      !/^[1-9][0-9]{0,9}$/.test(action.number) ||
      !/^[a-f0-9]{40}$/i.test(action.sha)
    )
      throw new Error(
        "The approval must identify a repository, pull request number and full commit SHA.",
      );
    const response = await this.fetcher(
      `https://api.github.com/repos/${action.owner}/${action.repository}/pulls/${action.number}${method === "PUT" ? "/merge" : ""}`,
      {
        method,
        redirect: "error",
        signal: AbortSignal.any([
          AbortSignal.timeout(20000),
          ...(signal ? [signal] : []),
        ]),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        ...(method === "PUT" && {
          body: JSON.stringify({
            sha: action.sha,
            merge_method: action.method,
          }),
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `GitHub returned HTTP ${response.status}. Recheck the pull request before approving.`,
      );
    return response.json() as Promise<{
      head?: { sha?: string };
      merged?: boolean;
      state?: string;
    }>;
  }
  async verify(action: Merge, signal?: AbortSignal) {
    const pull = await this.request(action, "GET", signal);
    if (pull.head?.sha?.toLowerCase() !== action.sha.toLowerCase())
      throw new Error(
        "The pull request head changed. Start a new run with the reviewed SHA.",
      );
    if (pull.state !== "open" && !pull.merged)
      throw new Error("The pull request is closed.");
    return pull;
  }
  async merge(action: Merge, signal?: AbortSignal) {
    // A restart after a successful merge observes it before making another request.
    if ((await this.verify(action, signal)).merged) return;
    const result = await this.request(action, "PUT", signal);
    if (!result.merged)
      throw new Error("GitHub did not merge the approved pull request.");
  }
}
