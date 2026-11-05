"use client";
import { RotateCcw, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProjectArchive } from "@/components/projects/project-archive";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { deleteArchivedConversations } from "@/lib/delete-archived-conversations";
import { sessionsChanged } from "./use-project-sessions";

type Archived = {
  sessionId: string;
  conversationId: number;
  name: string;
  archivedAt: string;
  projectName: string | null;
  projectArchived: boolean;
  deletedAt: string | null;
};
export function ConversationArchives() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { request, connected } = useMachineProjects(deviceId);
  const [items, setItems] = useState<Archived[]>();
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState<Archived[]>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await request<{ conversations: Archived[] }>(
          "/v1/archives/conversations",
          { signal },
        );
        if (!signal?.aborted) setItems(data.conversations);
      } catch (cause) {
        if (!signal?.aborted)
          setError(
            cause instanceof Error ? cause.message : "Could not load archives.",
          );
      }
    },
    [request],
  );
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [connected, load]);
  async function change(item: Archived, remove: boolean) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const notification = toast.add({
      title: remove ? "Deleting conversation…" : "Restoring conversation…",
      type: "loading",
      timeout: 0,
    });
    try {
      await request(
        `/v1/sessions/${item.sessionId}/conversations/${item.conversationId}/${remove ? "archive" : "restore"}`,
        {
          method: remove ? "DELETE" : "POST",
          ...(!remove ? { body: "{}" } : {}),
        },
        20000,
      );
      setDeleting(undefined);
      toast.update(notification, {
        title: remove
          ? "Conversation permanently deleted"
          : "Conversation restored",
        description: item.name,
        type: "success",
        timeout: 4500,
      });
      sessionsChanged();
      await load();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Archive operation failed.";
      setError(message);
      toast.update(notification, {
        title: "Archive operation failed",
        description: message,
        type: "error",
        timeout: 7000,
      });
    } finally {
      setBusy(false);
    }
  }
  async function deleteSelected() {
    if (busy || !deleting?.length) return;
    setBusy(true);
    setError(undefined);
    const notification = toast.add({
      title: "Deleting archived conversations…",
      type: "loading",
      timeout: 0,
    });
    try {
      const { deleted, failures } = await deleteArchivedConversations(
        deleting,
        (item) =>
          request(
            `/v1/sessions/${item.sessionId}/conversations/${item.conversationId}/archive`,
            { method: "DELETE" },
            20000,
          ),
      );
      setDeleting(undefined);
      const description = failures.length
        ? failures
            .map(({ target, message }) => `${target.name}: ${message}`)
            .join("; ")
        : undefined;
      if (description) setError(description);
      toast.update(notification, {
        title: failures.length
          ? `${deleted} deleted; ${failures.length} could not be deleted`
          : `${deleted} conversation${deleted === 1 ? "" : "s"} permanently deleted`,
        description,
        type: failures.length ? "error" : "success",
        timeout: failures.length ? 7000 : 4500,
      });
      sessionsChanged();
      await load();
    } catch (cause) {
      const description =
        cause instanceof Error ? cause.message : "Deletion failed.";
      setError(description);
      toast.update(notification, {
        title: "Could not finish deletion",
        description,
        type: "error",
        timeout: 7000,
      });
      await load();
    } finally {
      setBusy(false);
    }
  }
  if (!connected)
    return (
      <p className="text-sm text-muted-foreground">
        Connect this machine from Manage devices.
      </p>
    );
  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Archives</h1>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {items === undefined && (
        <p className="text-xs text-muted-foreground">Loading archives…</p>
      )}
      {!!items?.length && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Conversations</h2>
            <Button
              size="xs"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setError(undefined);
                setDeleting([...items]);
              }}
            >
              <Trash2 /> Delete all conversations
            </Button>
          </div>
          {items?.map((item) => (
            <div
              key={`${item.sessionId}:${item.conversationId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.projectName ?? "Outside projects"} ·{" "}
                  {new Date(item.archivedAt).toLocaleDateString()}
                  {item.projectArchived ? " · Restore project first" : ""}
                  {item.deletedAt
                    ? " · Deletion interrupted; retry to finish"
                    : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy || item.projectArchived || !!item.deletedAt}
                  onClick={() => void change(item, false)}
                >
                  <RotateCcw />
                  Restore
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setError(undefined);
                    setDeleting([item]);
                  }}
                >
                  <Trash2 />
                  Delete permanently
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}
      <ProjectArchive deviceId={deviceId} />
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleting?.length === 1
                ? `Delete ${deleting[0].name} permanently?`
                : `Delete all ${deleting?.length ?? 0} archived conversations?`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Messages, attachments and saved execution state will be erased. This
            cannot be undone. Project files stay untouched. Busy sessions and
            histories with surviving dependants cannot be deleted. In a bulk
            deletion, those items remain archived and failures are reported.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setDeleting(undefined)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void deleteSelected()}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
