"use client";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { useChatModels } from "./use-chat-models";
export function ChatComposer({
  content,
  onChange,
  onSend,
  sending,
  pending,
  working,
  models,
}: {
  content: string;
  onChange: (content: string) => void;
  onSend: () => void;
  sending: boolean;
  pending: boolean;
  working: boolean;
  models: ReturnType<typeof useChatModels>;
}) {
  const label = pending
    ? "Retry message"
    : working
      ? "Queue message"
      : "Send message";
  return (
    <form
      className="rounded-xl bg-muted/50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <Textarea
        aria-label="Message"
        placeholder="Message"
        rows={2}
        className="field-sizing-content min-h-14 max-h-48 resize-none border-0 bg-transparent px-1 py-2 dark:bg-transparent text-sm shadow-none focus-visible:ring-0"
        maxLength={32000}
        value={content}
        disabled={sending || pending}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (!sending && content.trim() && (pending || models.model))
              event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Select
          value={models.selected ?? null}
          onValueChange={models.chooseModel}
          disabled={sending || pending || working || !models.models.length}
        >
          <SelectTrigger
            aria-label="Model"
            className="max-w-full border-0 bg-transparent px-1 text-xs dark:bg-transparent dark:hover:bg-accent shadow-none hover:bg-accent"
          >
            <SelectValue>
              {models.model?.name ??
                (!models.loaded
                  ? "Loading models…"
                  : models.selected
                    ? "Model unavailable"
                    : "Choose model")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {models.models.map((model) => (
              <SelectItem key={models.keyOf(model)} value={models.keyOf(model)}>
                <span>{model.name}</span>
                <span className="text-muted-foreground">{model.provider}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {models.model?.reasoning && models.model.thinkingLevels.length > 0 && (
          <Select
            value={models.level ?? null}
            onValueChange={models.chooseLevel}
            disabled={sending || pending || working}
          >
            <SelectTrigger
              aria-label="Thinking level"
              className="border-0 bg-transparent px-1 text-xs dark:bg-transparent dark:hover:bg-accent capitalize shadow-none hover:bg-accent"
            >
              <SelectValue>{models.level}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {models.model.thinkingLevels.map((level) => (
                <SelectItem key={level} value={level} className="capitalize">
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          type="submit"
          size="icon"
          className="ml-auto size-8 shrink-0"
          aria-label={label}
          title={label}
          disabled={sending || !content.trim() || (!pending && !models.model)}
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
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
  );
}
