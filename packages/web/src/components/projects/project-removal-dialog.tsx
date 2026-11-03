"use client";
import { Archive } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BackendRequestError } from "@/hooks/use-backend-request";
import { type Project, useMachineProjects } from "./projects-provider";

export function ProjectRemovalDialog({
  project,
  deviceId,
  onClose,
  onRemoved,
}: {
  project: Project;
  deviceId: string;
  onClose: () => void;
  onRemoved: (id: string) => void;
}) {
  const { connected, request, refresh } = useMachineProjects(deviceId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [needsStop, setNeedsStop] = useState(false);
  async function archive(stop: boolean) {
    if (!connected || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const path = `/v1/projects/${encodeURIComponent(project.id)}`;
      await request(
        stop ? `${path}/stop-and-archive` : path,
        {
          method: stop ? "POST" : "DELETE",
        },
        30000,
      );
      await refresh();
      onRemoved(project.id);
      onClose();
    } catch (cause) {
      if (cause instanceof BackendRequestError && cause.code === "project_busy")
        setNeedsStop(true);
      setError(
        cause instanceof Error ? cause.message : "Could not archive project.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Archive {project.name}?</DialogTitle>
          <DialogDescription>
            Sessions and conversations can be restored from Machine settings →
            Projects. Source files stay on this machine.
          </DialogDescription>
        </DialogHeader>
        <p className="break-all font-mono text-xs text-muted-foreground">
          {project.path}
        </p>
        {!connected && (
          <p role="status" className="text-xs text-muted-foreground">
            Connect this machine to archive the project.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {needsStop && (
          <p className="text-sm text-muted-foreground">
            This will interrupt running work and cancel queued messages.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !connected}
            onClick={() => void archive(needsStop)}
          >
            <Archive className="size-3.5" />
            {busy
              ? "Archiving…"
              : needsStop
                ? "Stop all and archive"
                : "Archive project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
