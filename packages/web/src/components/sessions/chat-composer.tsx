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
import {
  useCommands,
  useRegisterCommands,
} from "@/components/commands/command-registry";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { slashSuggestions } from "@/lib/command-registry";
import { type CommandId, commands as commandMetadata } from "@/lib/commands";
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
  const commands = useCommands();
  const [modelOpen, setModelOpen] = useState(false);
  const slashList = useRef<HTMLUListElement>(null);
  useRegisterCommands({
    "composer.model": {
      disabled: !models.loaded
        ? "Wait for the model catalog to load."
        : models.models.length === 0
          ? "Enable a provider and favorite a model first."
          : undefined,
      run: () => setModelOpen(true),
    },
  });
  const [composing, setComposing] = useState(false);
  const suggestions = slashSuggestions(content, composing);
  const latestContent = useRef(content);
  latestContent.current = content;
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
        {suggestions.length > 0 && (
          <ScrollArea className="mb-3 h-48" viewportClassName="pr-3">
            <ul
              ref={slashList}
              aria-label="Slash commands"
              className="flex flex-col gap-1"
              onKeyDown={(event) => {
                const buttons = [
                  ...(slashList.current?.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ) ?? []),
                ];
                const index = buttons.indexOf(
                  event.target as HTMLButtonElement,
                );
                if (
                  (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                  index >= 0
                ) {
                  event.preventDefault();
                  buttons[
                    (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                      buttons.length
                  ]?.focus();
                }
              }}
            >
              {suggestions.map(([name, rawId]) => {
                const id = rawId as CommandId;
                const handler = commands.get(id);
                return (
                  <li key={name}>
                    <Button
                      aria-label={name}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                      disabled={!handler || !!handler.disabled}
                      title={handler?.disabled}
                      onClick={() => {
                        try {
                          Promise.resolve(commands.invoke(id))
                            .then(() => {
                              if (latestContent.current === content)
                                onChange("");
                            })
                            .catch((error) =>
                              setFileError(
                                error instanceof Error
                                  ? error.message
                                  : "Command failed.",
                              ),
                            );
                        } catch (error) {
                          setFileError(
                            error instanceof Error
                              ? error.message
                              : "Command unavailable.",
                          );
                        }
                      }}
                    >
                      <span>
                        <span className="block font-mono text-xs text-foreground">
                          {name}
                        </span>
                        <span className="mt-0.5 block text-xs text-foreground/70">
                          {commandMetadata[id].label}
                        </span>
                      </span>
                    </Button>
                    {handler?.disabled && (
                      <p className="px-2 pb-2 text-[11px] text-foreground/65">
                        {handler.disabled}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
        <Textarea
          aria-label="Message"
          placeholder="Ask anything…"
          rows={2}
          className="field-sizing-content min-h-14 max-h-48 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          maxLength={32000}
          value={content}
          disabled={sending || pending || loadingFiles}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              void attach(Array.from(event.clipboardData.files));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && suggestions.length && !composing) {
              const first = slashList.current?.querySelector<HTMLButtonElement>(
                "button:not(:disabled)",
              );
              if (first) {
                event.preventDefault();
                first.focus();
                return;
              }
            }
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
            <ChatModelControl
              models={models}
              disabled={disabled}
              open={modelOpen}
              onOpenChange={setModelOpen}
            />
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
