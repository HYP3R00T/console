"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type AgentConfiguration,
  type Conversation,
  fieldClass,
  type Provider,
} from "@/lib/console-api";

export function SessionInspector({
  session,
  providers,
  disabled,
  onSave,
  onDirtyChange,
}: {
  session: Conversation;
  providers: Provider[];
  disabled: boolean;
  onSave: (input: AgentConfiguration) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const savedProvider = session.model?.provider ?? "";
  const savedModel = session.model?.modelId ?? "";
  const savedThinking = session.thinkingLevel;
  const [draft, setDraft] = useState<AgentConfiguration>({
    provider: savedProvider,
    model: savedModel,
    thinkingLevel: savedThinking,
  });
  useEffect(() => {
    setDraft({
      provider: savedProvider,
      model: savedModel,
      thinkingLevel: savedThinking,
    });
  }, [savedProvider, savedModel, savedThinking]);
  const provider = providers.find((item) => item.id === draft.provider);
  const model = provider?.models.find((item) => item.id === draft.model);
  const dirty =
    draft.provider !== savedProvider ||
    draft.model !== savedModel ||
    draft.thinkingLevel !== savedThinking;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  return (
    <aside
      className="space-y-6 border-t p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l"
      aria-label="Session inspector"
    >
      <header className="flex items-center gap-2">
        <SlidersHorizontalIcon
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="font-semibold">Session settings</h2>
      </header>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(draft);
        }}
      >
        <label className="block space-y-2 text-sm">
          Provider
          <select
            className={fieldClass}
            value={draft.provider}
            disabled={disabled}
            onChange={(event) =>
              setDraft({
                provider: event.target.value,
                model: "",
                thinkingLevel: "off",
              })
            }
          >
            <option value="">Choose a provider</option>
            {providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.configured ? "" : " · Not connected"}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm">
          Model
          <select
            className={fieldClass}
            value={draft.model}
            disabled={disabled || !provider}
            onChange={(event) => {
              const next = provider?.models.find(
                (item) => item.id === event.target.value,
              );
              setDraft({
                ...draft,
                model: event.target.value,
                thinkingLevel: next?.thinkingLevels.includes(
                  draft.thinkingLevel,
                )
                  ? draft.thinkingLevel
                  : (next?.thinkingLevels[0] ?? "off"),
              });
            }}
          >
            <option value="">Choose a model</option>
            {draft.model && !model && (
              <option value={draft.model}>{draft.model} · Unavailable</option>
            )}
            {provider?.models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm">
          Thinking level
          <select
            className={fieldClass}
            value={draft.thinkingLevel}
            disabled={disabled || !model || model.thinkingLevels.length < 2}
            onChange={(event) =>
              setDraft({ ...draft, thinkingLevel: event.target.value })
            }
          >
            {(model?.thinkingLevels ?? [draft.thinkingLevel]).map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        {model && (
          <p className="text-xs text-muted-foreground">
            Model context capacity: {model.contextWindow.toLocaleString()}{" "}
            tokens. Thinking choices come from Pi's model catalog.
          </p>
        )}
        {provider && !provider.configured && (
          <p className="text-xs text-muted-foreground">
            <Link className="underline" href="/settings/providers">
              Connect this provider
            </Link>{" "}
            before sending messages.
          </p>
        )}
        <Button
          className="w-full"
          type="submit"
          disabled={disabled || !model || !dirty}
        >
          Save settings
        </Button>
        <p className="text-xs text-muted-foreground">
          {dirty
            ? "Unsaved settings. Save before sending."
            : "Settings are saved with this session."}{" "}
          Finish or cancel active work before changing them.
        </p>
      </form>
      <section className="space-y-2 border-t pt-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Execution
        </h3>
        <p className="text-sm">Conversation only</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          No filesystem or command tools are enabled. Closing this page leaves
          backend work running.
        </p>
      </section>
    </aside>
  );
}
