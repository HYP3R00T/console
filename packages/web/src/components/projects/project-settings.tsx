"use client";
import { FolderOpen } from "lucide-react";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SettingsHeading } from "@/components/settings/settings-presentation";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
    <div className="flex w-full min-w-0 flex-col gap-6">
      <SettingsHeading
        title="Projects folder"
        icon={FolderOpen}
        description="Default location for new and cloned projects."
        help="Changing this location does not move existing projects. Missing folders are created only when requested during setup."
      />
      <Separator />
      {!connected ? (
        <p className="text-sm text-muted-foreground">
          Connect this machine from Manage devices.
        </p>
      ) : (
        <form onSubmit={save} className="flex flex-col items-start gap-5">
          <FieldGroup className="w-full">
            <Field>
              <FieldLabel htmlFor="machine-projects-root">
                Projects folder
              </FieldLabel>
              <Input
                id="machine-projects-root"
                value={value ?? settings?.projectsRoot ?? ""}
                onChange={(e) => setValue(e.target.value)}
                placeholder="/absolute/path/to/Projects"
                required
                disabled={busy || !settings}
              />
              <FieldDescription>
                Changing this location does not move existing projects. Missing
                folders are created only when requested during setup.
              </FieldDescription>
            </Field>
          </FieldGroup>
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
    </div>
  );
}
