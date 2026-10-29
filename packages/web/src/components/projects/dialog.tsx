"use client";

import { useRef, useState } from "react";
import { ChoiceSelect } from "@/components/shared/choice-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, fieldClass } from "@/lib/api";

export function ProjectDialog({
  open,
  machineId,
  machineName,
  onClose,
  onCreated,
}: {
  open: boolean;
  machineId: string;
  machineName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [source, setSource] = useState("directory");
  const [path, setPath] = useState("");
  const [repository, setRepository] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ signature: string; requestId: string }>(undefined);
  async function create() {
    if (working) return;
    const input = {
      name: name.trim(),
      path: path.trim(),
      repository: source === "repository" ? repository.trim() : undefined,
      createDirectory: source === "new",
    };
    const signature = JSON.stringify(input);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, requestId: crypto.randomUUID() };
    setWorking(true);
    setError("");
    try {
      await api(
        "/workspaces",
        "POST",
        { ...input, requestId: attempt.current.requestId },
        undefined,
        machineId,
      );
      attempt.current = undefined;
      setName("");
      setPath("");
      setRepository("");
      onCreated();
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !working) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!working}>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>On {machineName}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label className="block space-y-2">
            Project name
            <input
              className={fieldClass}
              required
              maxLength={80}
              value={name}
              disabled={working}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="space-y-2">
            <span>Source</span>
            <ChoiceSelect
              label="Project source"
              value={source}
              disabled={working}
              onChange={(value) => {
                setSource(value);
                setPath("");
              }}
              items={[
                {
                  value: "directory",
                  label: "Existing folder on this machine",
                },
                {
                  value: "repository",
                  label: "Clone a public GitHub repository",
                },
                { value: "new", label: "New folder on this machine" },
              ]}
            />
          </div>
          {source === "repository" && (
            <label className="block space-y-2">
              Repository URL
              <input
                className={fieldClass}
                type="url"
                required
                placeholder="https://github.com/owner/repository"
                value={repository}
                disabled={working}
                onChange={(event) => setRepository(event.target.value)}
              />
            </label>
          )}
          <label className="block space-y-2">
            {source === "directory"
              ? "Folder path"
              : "Destination folder (optional)"}
            <input
              className={fieldClass}
              required={source === "directory"}
              placeholder={
                source === "directory"
                  ? "/absolute/path/on/this/machine"
                  : "Use the machine’s project directory"
              }
              value={path}
              disabled={working}
              onChange={(event) => setPath(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={working}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={working}>
              {working ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
