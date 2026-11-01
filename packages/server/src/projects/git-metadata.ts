import { execFile } from "node:child_process";
import { gitEnvironment } from "./git.ts";

export type GitWorktree = {
  path: string;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
};
export type GitMetadata =
  | { status: "not_repository" }
  | { status: "unavailable"; reason: string }
  | {
      status: "repository";
      root: string | null;
      bare: boolean;
      linkedWorktree: boolean;
      currentBranch: string | null;
      branches: string[];
      worktrees: GitWorktree[];
    };

function readGit(cwd: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "git",
      [
        "--no-optional-locks",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "protocol.allow=never",
        ...args,
      ],
      {
        cwd,
        env: gitEnvironment(),
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) reject(Object.assign(error, { stderr }));
        else resolve(stdout);
      },
    );
  });
}
function branchName(ref: string) {
  return ref.startsWith("refs/heads/") ? ref.slice(11) : ref;
}
function parseWorktrees(output: string): GitWorktree[] {
  return output
    .split("\0\0")
    .filter(Boolean)
    .map((record) => {
      const fields = record.split("\0");
      const branch = fields.find((field) => field.startsWith("branch "));
      return {
        path:
          fields.find((field) => field.startsWith("worktree "))?.slice(9) ?? "",
        branch: branch ? branchName(branch.slice(7)) : null,
        detached: fields.includes("detached"),
        bare: fields.includes("bare"),
        locked: fields.some(
          (field) => field === "locked" || field.startsWith("locked "),
        ),
        prunable: fields.some(
          (field) => field === "prunable" || field.startsWith("prunable "),
        ),
      };
    });
}
export async function inspectGit(path: string): Promise<GitMetadata> {
  try {
    let bare: boolean;
    try {
      bare =
        (await readGit(path, ["rev-parse", "--is-bare-repository"])).trim() ===
        "true";
    } catch (error) {
      if (
        (error as { stderr?: string }).stderr?.startsWith(
          "fatal: not a git repository",
        )
      )
        return { status: "not_repository" };
      throw error;
    }
    const [root, gitDir, commonDir, currentBranch, branches, worktrees] =
      await Promise.all([
        bare
          ? null
          : readGit(path, ["rev-parse", "--show-toplevel"]).then((s) =>
              s.replace(/\n$/, ""),
            ),
        readGit(path, ["rev-parse", "--absolute-git-dir"]),
        readGit(path, [
          "rev-parse",
          "--path-format=absolute",
          "--git-common-dir",
        ]),
        readGit(path, ["symbolic-ref", "--quiet", "--short", "HEAD"])
          .then((s) => s.trim())
          .catch((error) => {
            if (error.code === 1) return null;
            throw error;
          }),
        readGit(path, [
          "for-each-ref",
          "--format=%(refname)",
          "--sort=refname",
          "refs/heads/",
        ]),
        readGit(path, ["worktree", "list", "--porcelain", "-z"]),
      ]);
    return {
      status: "repository",
      root,
      bare,
      linkedWorktree: gitDir.trim() !== commonDir.trim(),
      currentBranch,
      branches: branches.split("\n").filter(Boolean).map(branchName),
      worktrees: parseWorktrees(worktrees),
    };
  } catch (error) {
    return {
      status: "unavailable",
      reason:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "Git is not installed or the directory is unavailable."
          : "Git metadata could not be read.",
    };
  }
}
