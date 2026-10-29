"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, fieldClass, type Workspace } from "@/lib/api";
export function ProjectInspector({ id }: { id: string }) {
  const [project, setProject] = useState<Workspace>();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api<Workspace[]>("/workspaces", "GET", undefined, controller.signal)
      .then((rows) => {
        const value = rows.find((item) => item.id === id);
        setProject(value);
        setName(value?.name ?? "");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [id]);
  return (
    <section className="space-y-4 p-4">
      <h2 className="font-semibold">Project settings</h2>
      {project && (
        <>
          <label className="block space-y-2 text-sm">
            Name
            <input
              className={fieldClass}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <dl className="space-y-2 text-xs">
            <dt className="text-muted-foreground">Directory</dt>
            <dd className="break-all">{project.path}</dd>
            {project.repository && (
              <>
                <dt className="text-muted-foreground">Repository</dt>
                <dd className="break-all">{project.repository}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Status</dt>
            <dd>{project.state ?? "ready"}</dd>
          </dl>
          <Button
            size="sm"
            disabled={!name.trim() || name === project.name}
            onClick={async () => {
              try {
                await api(`/workspaces/${id}`, "PATCH", { name });
                setProject({ ...project, name });
                setMessage("Saved.");
                window.dispatchEvent(new Event("console:tree-changed"));
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          >
            Save name
          </Button>
        </>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  );
}
