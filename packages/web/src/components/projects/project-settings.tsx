"use client";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectArchive } from "./project-archive";
import { useMachineProjects } from "./projects-provider";
export function ProjectSettings() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const {
    connected,
    settings,
    request,
    refresh,
    error: loadError,
  } = useMachineProjects(deviceId);
  const [value, setValue] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await request("/v1/machine/settings", {
        method: "PUT",
        body: JSON.stringify({ projectsRoot: value ?? settings?.projectsRoot }),
      });
      await refresh();
      setValue(undefined);
      setMessage("Projects folder saved.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-xl font-semibold">Projects</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Default location for new and cloned projects on this machine.
        </p>
      </header>
      {!connected ? (
        <p className="text-sm text-muted-foreground">
          Connect this machine from Manage devices.
        </p>
      ) : (
        <form onSubmit={save} className="max-w-2xl space-y-5">
          <div className="space-y-2">
            <Label htmlFor="machine-projects-root">Projects folder</Label>
            <Input
              id="machine-projects-root"
              value={value ?? settings?.projectsRoot ?? ""}
              onChange={(e) => setValue(e.target.value)}
              placeholder="/absolute/path/to/Projects"
              required
              disabled={busy || !settings}
            />
            <p className="text-xs text-muted-foreground">
              Changing this location does not move existing projects. Missing
              folders are created only when requested during setup.
            </p>
          </div>
          {(error || loadError) && (
            <p role="alert" className="text-sm text-destructive">
              {error ?? loadError}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
          <Button type="submit" disabled={busy || !settings}>
            {busy ? "Saving…" : "Save location"}
          </Button>
        </form>
      )}
      {connected && <ProjectArchive key={deviceId} deviceId={deviceId} />}
    </div>
  );
}
