"use client";
import { Trash2 } from "lucide-react";
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
  async function remove() {
    if (!connected || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await request(`/v1/projects/${encodeURIComponent(project.id)}`, {
        method: "DELETE",
      });
      await refresh();
      onRemoved(project.id);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove project.",
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
          <DialogTitle>Remove {project.name}?</DialogTitle>
          <DialogDescription>
            Remove this project from Console. Files stay on the machine.
          </DialogDescription>
        </DialogHeader>
        <p className="break-all font-mono text-xs text-muted-foreground">
          {project.path}
        </p>
        {!connected && (
          <p role="status" className="text-xs text-muted-foreground">
            Connect this machine to remove the project.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !connected}
            onClick={() => void remove()}
          >
            <Trash2 className="size-3.5" />
            {busy ? "Removing…" : "Remove project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
