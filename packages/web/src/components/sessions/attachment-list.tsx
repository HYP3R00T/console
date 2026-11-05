"use client";
import { Download, FileText, X } from "lucide-react";
import { useState } from "react";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import { attachmentBytes, type ChatAttachment } from "./attachments";

export function DraftAttachments({
  files,
  disabled,
  onRemove,
}: {
  files: ChatAttachment[];
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <ScrollArea className="w-full min-w-0" scrollbarOrientation="horizontal">
      <section className="flex w-max gap-2 pb-3" aria-label="Attachments">
        {files.map((file) => (
          <div
            key={file.id}
            className="relative flex w-28 shrink-0 flex-col gap-1 rounded-lg bg-background/50 p-2"
          >
            {file.mimeType.startsWith("image/") ? (
              // biome-ignore lint/performance/noImgElement: Local attachment previews do not use remote image optimization.
              <img
                src={`data:${file.mimeType};base64,${file.data}`}
                alt={file.name}
                className="h-16 w-full rounded-md object-cover"
              />
            ) : (
              <FileText className="my-4 size-8 text-muted-foreground" />
            )}
            <span className="truncate text-xs" title={file.name}>
              {file.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.ceil(attachmentBytes(file) / 1024)} KB
            </span>
            <ControlTooltip label={`Remove ${file.name}`}>
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                className="absolute right-1 top-1"
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemove(file.id)}
              >
                <X className="size-3" />
              </Button>
            </ControlTooltip>
          </div>
        ))}
      </section>
    </ScrollArea>
  );
}
export type MessageAttachment = {
  name: string;
  mimeType: string;
  size: number;
  index: number;
  thumbnail?: string;
};
export function MessageAttachments({
  files,
  path,
  entryId,
  request,
}: {
  files: MessageAttachment[];
  path: string;
  entryId: number;
  request: ReturnType<typeof useBackendRequest>["request"];
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<number>();
  async function download(file: MessageAttachment) {
    if (busy !== undefined) return;
    setBusy(file.index);
    setError(undefined);
    try {
      const result = await request<{
        name: string;
        mimeType: string;
        data: string;
      }>(`${path}/entries/${entryId}/attachments/${file.index}`);
      const bytes = Uint8Array.from(atob(result.data), (character) =>
        character.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/octet-stream" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not download attachment.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {files.map((file) => (
          <ControlTooltip key={file.index} label={`Download ${file.name}`}>
            <Button
              type="button"
              variant="secondary"
              className="h-auto max-w-52 gap-2 p-2"
              disabled={busy !== undefined}
              onClick={() => void download(file)}
            >
              {file.thumbnail ? (
                // biome-ignore lint/performance/noImgElement: Thumbnail bytes come from the backend conversation projection.
                <img
                  src={`data:image/webp;base64,${file.thumbnail}`}
                  alt=""
                  className="size-12 rounded-md object-cover"
                />
              ) : (
                <FileText className="size-4 shrink-0" />
              )}
              <span className="min-w-0 text-left">
                <span className="block truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {Math.ceil(file.size / 1024)} KB
                </span>
              </span>
              <Download className="size-3 shrink-0" />
            </Button>
          </ControlTooltip>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
