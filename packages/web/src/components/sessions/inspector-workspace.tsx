"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import {
  InspectorSection,
  InspectorSectionActions,
  InspectorSectionContent,
  InspectorSectionDescription,
  InspectorSectionHeader,
  InspectorSectionTitle,
} from "./inspector-section";

type Worktree = { path: string; branch: string | null };
export type RemoteWorkspace = {
  profile: string | null;
  profiles: string[];
  invalid: boolean;
};

export function InspectorWorkspace({
  path,
  request,
  assigned,
  disabled,
  save,
  sandbox,
  saveSandbox,
  remote,
  saveRemote,
  reloadRemote,
  hostMcp,
}: {
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
  assigned?: string | null;
  disabled: boolean;
  save: (worktree: string | null) => Promise<boolean>;
  sandbox?: boolean;
  saveSandbox: (enabled: boolean) => Promise<boolean>;
  remote?: RemoteWorkspace;
  saveRemote: (profile: string | null) => Promise<boolean>;
  reloadRemote: () => Promise<void>;
  hostMcp?: boolean;
}) {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [choices, setChoices] = useState<Worktree[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      setChoices(
        (await request<{ worktrees: Worktree[] }>(`${path}/worktrees`))
          .worktrees,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not read Git worktrees.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      {assigned !== undefined && !remote?.profile && (
        <InspectorSection>
          <InspectorSectionHeader>
            <InspectorSectionTitle>Execution workspace</InspectorSectionTitle>
            <InspectorSectionDescription>
              Use a different Git checkout for this conversation’s tools.
              Otherwise, keep the project directory.
            </InspectorSectionDescription>
          </InspectorSectionHeader>
          <InspectorSectionContent className="flex flex-col gap-2">
            {assigned ? (
              <code className="wrap-anywhere">{assigned}</code>
            ) : (
              <p>Using the project directory.</p>
            )}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            {choices?.length === 0 && (
              <p>No other linked worktrees are available.</p>
            )}
            {choices && choices.length > 0 && (
              <ul className="flex flex-col gap-2">
                {choices.map((tree) => (
                  <li
                    key={tree.path}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p>{tree.branch ?? "Detached HEAD"}</p>
                      <code className="wrap-anywhere text-muted-foreground">
                        {tree.path}
                      </code>
                    </div>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={disabled || assigned === tree.path}
                      onClick={() => void save(tree.path)}
                    >
                      {assigned === tree.path ? "Attached" : "Attach"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </InspectorSectionContent>
          <InspectorSectionActions className="flex-wrap gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading
                ? "Reading Git…"
                : choices
                  ? "Refresh worktrees"
                  : "Find worktrees"}
            </Button>
            {assigned && (
              <Button
                variant="ghost"
                size="xs"
                disabled={disabled}
                onClick={() => void save(null)}
              >
                Use project directory
              </Button>
            )}
          </InspectorSectionActions>
        </InspectorSection>
      )}
      {sandbox !== undefined && !remote?.profile && (
        <InspectorSection>
          <InspectorSectionHeader>
            <InspectorSectionTitle>Workspace sandbox</InspectorSectionTitle>
            <InspectorSectionDescription>
              Run workspace tools with a separate filesystem and network
              namespace. The checkout is mounted at /workspace.
            </InspectorSectionDescription>
          </InspectorSectionHeader>
          <InspectorSectionContent>
            <p>
              {sandbox
                ? "Sandbox enabled"
                : "Tools use the backend user’s environment."}
            </p>
          </InspectorSectionContent>
          <InspectorSectionActions>
            <Button
              variant="outline"
              size="xs"
              disabled={disabled}
              onClick={() => void saveSandbox(!sandbox)}
            >
              {sandbox ? "Disable sandbox" : "Enable sandbox"}
            </Button>
          </InspectorSectionActions>
        </InspectorSection>
      )}
      {remote && (
        <InspectorSection>
          <InspectorSectionHeader>
            <InspectorSectionTitle>Remote execution</InspectorSectionTitle>
            <InspectorSectionDescription>
              Run tools on another machine using a saved SSH workspace.
            </InspectorSectionDescription>
          </InspectorSectionHeader>
          <InspectorSectionContent className="flex flex-col gap-2">
            {remote.profiles.length === 0 && !remote.invalid && (
              <p>
                <Link
                  className="underline underline-offset-4"
                  href={`/devices/${encodeURIComponent(deviceId)}/settings/ssh`}
                >
                  Add an SSH workspace
                </Link>{" "}
                in machine settings.
              </p>
            )}
            <p>
              Reload reads the backend configuration file and closes shared SSH
              connections. Active calls in any chat may be interrupted.
            </p>
            {remote.invalid && (
              <p role="alert" className="text-destructive">
                The backend could not read its execution profiles.
              </p>
            )}
            {remote.profile && !remote.profiles.includes(remote.profile) && (
              <p role="alert" className="text-destructive">
                Profile {remote.profile} is unavailable. Select another profile
                or return to local execution.
              </p>
            )}
            {(assigned || sandbox || hostMcp) && (
              <p>
                Detach the worktree and disable the sandbox and host MCP before
                switching.
              </p>
            )}
            {remote.profiles.length > 0 && (
              <ul className="flex flex-col gap-2">
                {remote.profiles.map((profile) => (
                  <li
                    key={profile}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>{profile}</span>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={
                        disabled ||
                        !!assigned ||
                        sandbox ||
                        hostMcp ||
                        profile === remote.profile
                      }
                      onClick={() => void saveRemote(profile)}
                    >
                      {profile === remote.profile ? "Active" : "Use profile"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </InspectorSectionContent>
          <InspectorSectionActions className="flex-wrap gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={disabled}
              onClick={() => void reloadRemote()}
            >
              Reload SSH profiles
            </Button>
            {remote.profile && (
              <Button
                variant="outline"
                size="xs"
                disabled={disabled}
                onClick={() => void saveRemote(null)}
              >
                Return to local execution
              </Button>
            )}
          </InspectorSectionActions>
        </InspectorSection>
      )}
    </>
  );
}
