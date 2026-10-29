"use client";

import { useEffect, useState } from "react";
import { ChoiceSelect } from "@/components/shared/choice-select";
import { Button } from "@/components/ui/button";
import { api, fieldClass, type SandboxPolicy } from "@/lib/api";

const empty: SandboxPolicy = {
  enabled: false,
  workspace: "",
  readPaths: [],
  writePaths: [],
  network: "blocked",
};
const editable = (policy: SandboxPolicy) => ({
  ...policy,
  readPaths: policy.readPaths.join("\n"),
  writePaths: policy.writePaths.join("\n"),
});
const paths = (text: string) =>
  text
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);

export function SandboxSettings({
  policy = empty,
  fixedWorkspace,
  disabled,
  onSave,
  onDirtyChange,
}: {
  policy: SandboxPolicy;
  fixedWorkspace?: boolean;
  disabled: boolean;
  onSave: (policy: SandboxPolicy) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const saved = JSON.stringify(policy);
  const [draft, setDraft] = useState(editable(policy));
  const [support, setSupport] = useState<{
    available: boolean;
    version: string;
  }>();
  useEffect(() => {
    setDraft(editable(JSON.parse(saved)));
  }, [saved]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ available: boolean; version: string }>(
      "/sandbox/support",
      "GET",
      undefined,
      controller.signal,
    )
      .then(setSupport)
      .catch(() => {
        if (!controller.signal.aborted)
          setSupport({
            available: false,
            version: "Sandbox support unavailable",
          });
      });
    return () => controller.abort();
  }, []);
  const input: SandboxPolicy = {
    ...draft,
    readPaths: paths(draft.readPaths),
    writePaths: paths(draft.writePaths),
  };
  const dirty = JSON.stringify(input) !== saved;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  return (
    <details className="border-t pt-4" open={!policy.enabled}>
      <summary className="cursor-pointer text-sm font-medium">
        Sandbox · {policy.enabled ? "enabled" : "disabled"}
        {dirty ? " · unsaved" : ""}
      </summary>
      <p className="mt-3 text-xs text-muted-foreground">
        {support?.version ?? "Checking nono…"}. Each tool runs in a fresh,
        restricted process.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(input);
        }}
      >
        <fieldset disabled={disabled} className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft({ ...draft, enabled: event.target.checked })
              }
            />
            Enable sandboxed tools
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.commands ?? false}
              onChange={(event) =>
                setDraft({ ...draft, commands: event.target.checked })
              }
            />
            Enable sandboxed shell commands
          </label>
          <label className="block space-y-2 text-sm">
            Workspace
            <input
              className={fieldClass}
              placeholder="/absolute/path/to/project"
              maxLength={2000}
              value={draft.workspace}
              readOnly={fixedWorkspace}
              onChange={(event) =>
                setDraft({ ...draft, workspace: event.target.value })
              }
            />
          </label>
          <p className="text-xs text-muted-foreground">
            The workspace is readable by default. Other directories need
            explicit grants.
          </p>
          <label className="block space-y-2 text-sm">
            Additional readable directories
            <textarea
              className={fieldClass}
              rows={2}
              value={draft.readPaths}
              onChange={(event) =>
                setDraft({ ...draft, readPaths: event.target.value })
              }
            />
          </label>
          <label className="block space-y-2 text-sm">
            Writable directories
            <textarea
              className={fieldClass}
              rows={2}
              value={draft.writePaths}
              onChange={(event) =>
                setDraft({ ...draft, writePaths: event.target.value })
              }
            />
          </label>
          <p className="text-xs text-muted-foreground">
            One existing absolute directory per line. Writable grants include
            read access. Empty means no project writes.
          </p>
          <div className="block space-y-2 text-sm">
            Tool network access
            <ChoiceSelect
              label="Tool network access"
              value={draft.network}
              items={[
                { value: "blocked", label: "Blocked" },
                { value: "unrestricted", label: "Unrestricted (opt-in)" },
              ]}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  network: value as SandboxPolicy["network"],
                })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Enabling grants directory listings and file reads, optional
            directory creation/file writes, and HTTP GET when network is
            unrestricted. Shell commands require the separate opt-in above. Use
            writable grants and network access only as needed for setup.
            Provider access stays in the backend.
          </p>
          <Button
            className="w-full"
            type="submit"
            disabled={
              (!dirty && !policy.enabled) ||
              (draft.enabled &&
                (!support?.available || !draft.workspace.trim()))
            }
          >
            Save sandbox policy
          </Button>
        </fieldset>
        <p className="text-xs text-muted-foreground">
          nono also grants read-only access to Node, this worker, OpenSSL
          configuration, and system libraries. Console private storage cannot be
          granted; its source and runtime executables cannot be writable.
        </p>
      </form>
    </details>
  );
}
