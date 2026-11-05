"use client";
import {
  ArrowUp,
  CornerUpLeft,
  ImagePlus,
  Paperclip,
  Plus,
  Square,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { DraftAttachments } from "./attachment-list";
import { type ChatAttachment, fileAccept, readFiles } from "./attachments";
import { ChatModelControl } from "./chat-model-control";
import type { useChatModels } from "./use-chat-models";

export function ChatComposer({
  content,
  onChange,
  onSend,
  onStop,
  stopping = false,
  imageSupported,
  sending,
  pending,
  working,
  models,
  context,
  attachments,
  onAttachmentsChange,
}: {
  attachments: ChatAttachment[];
  onAttachmentsChange: (files: ChatAttachment[]) => void;
  content: string;
  onChange: (content: string) => void;
  onSend: (whenBusy?: "steer" | "followUp") => void;
  onStop?: () => void;
  stopping?: boolean;
  imageSupported?: boolean;
  sending: boolean;
  pending: boolean;
  working: boolean;
  models: ReturnType<typeof useChatModels>;
  context?: ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const reading = useRef(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string>();
  const unsupportedImages =
    !pending &&
    attachments.some((file) => file.mimeType.startsWith("image/")) &&
    !(imageSupported ?? models.model?.input?.includes("image"));
  const hasInput = !!content.trim() || attachments.length > 0;
  async function attach(files: File[]) {
    if (reading.current || sending || pending) return;
    reading.current = true;
    setLoadingFiles(true);
    setFileError(undefined);
    try {
      onAttachmentsChange(await readFiles(files, attachments));
    } catch (cause) {
      setFileError(
        cause instanceof Error ? cause.message : "Could not read files.",
      );
    } finally {
      reading.current = false;
      setLoadingFiles(false);
    }
  }
  const disabled = sending || pending || loadingFiles;
  const label = pending
    ? "Retry message"
    : working
      ? "Queue message"
      : "Send message";
  return (
    <div className="mx-auto w-full max-w-3xl">
      {context && (
        <fieldset
          disabled={loadingFiles}
          className="mx-3 mb-2 flex min-w-0 items-center gap-1 rounded-xl bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
        >
          {context}
        </fieldset>
      )}
      <form
        className="relative rounded-2xl bg-muted/50 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!loadingFiles && !unsupportedImages) onSend();
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void attach(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={fileAccept}
          className="hidden"
          aria-label="Attach files"
          onChange={(event) => {
            void attach(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <input
          ref={imageInput}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label="Attach images"
          onChange={(event) => {
            void attach(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        {attachments.length > 0 && (
          <DraftAttachments
            files={attachments}
            disabled={sending || pending || loadingFiles}
            onRemove={(id) =>
              onAttachmentsChange(attachments.filter((file) => file.id !== id))
            }
          />
        )}
        <Textarea
          aria-label="Message"
          placeholder="Ask anything…"
          rows={2}
          className="field-sizing-content min-h-14 max-h-48 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          maxLength={32000}
          value={content}
          disabled={sending || pending || loadingFiles}
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              void attach(Array.from(event.clipboardData.files));
            }
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (
                !sending &&
                !loadingFiles &&
                !unsupportedImages &&
                hasInput &&
                (pending || models.model)
              )
                event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="mt-2 flex min-w-0 items-center gap-1">
          <DropdownMenu>
            <ControlTooltip label="Add files and images">
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Add attachments"
                    disabled={sending || pending || loadingFiles}
                  />
                }
              >
                <Plus className="size-4" />
              </DropdownMenuTrigger>
            </ControlTooltip>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Add</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                  <Paperclip className="size-3.5" />
                  Files
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => imageInput.current?.click()}>
                  <ImagePlus className="size-3.5" />
                  Images
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {working && (
            <span
              role="status"
              className="min-w-0 truncate px-1 text-xs text-muted-foreground"
            >
              Working · queued input uses the active model
            </span>
          )}
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <ChatModelControl models={models} disabled={disabled} />
            {working && onStop && (
              <ControlTooltip label="Stop this conversation and withdraw queued messages">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Stop conversation"
                  disabled={stopping}
                  onClick={onStop}
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              </ControlTooltip>
            )}
            {working && (
              <ControlTooltip label="Steer at the next safe boundary using the active model">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Steer conversation"
                  disabled={
                    sending ||
                    pending ||
                    loadingFiles ||
                    unsupportedImages ||
                    !hasInput ||
                    stopping
                  }
                  onClick={() => onSend("steer")}
                >
                  <CornerUpLeft className="size-4" />
                </Button>
              </ControlTooltip>
            )}
            <ControlTooltip label={label}>
              <Button
                type="submit"
                size="icon"
                className="size-8 shrink-0"
                aria-label={label}
                disabled={
                  sending ||
                  loadingFiles ||
                  unsupportedImages ||
                  !hasInput ||
                  (!pending && !models.model)
                }
              >
                <ArrowUp className="size-4" />
              </Button>
            </ControlTooltip>
          </div>
        </div>
        {loadingFiles && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            Reading attachments…
          </p>
        )}
        {(fileError || unsupportedImages) && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {fileError ??
              "Choose a model that supports images or remove the images."}
          </p>
        )}
        {models.error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {models.error}
          </p>
        )}
        {models.loaded && !models.models.length && !models.error && (
          <p className="mt-2 text-xs text-muted-foreground">
            Star a model in Machine settings → Providers.
          </p>
        )}
      </form>
    </div>
  );
}
