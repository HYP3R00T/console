"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useModelPreferences } from "@/components/models/preferences";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AgentConfiguration, Conversation, Provider } from "@/lib/api";

export function ComposerModelPicker({
  session,
  providers,
  disabled,
  onSave,
}: {
  session: Conversation;
  providers: Provider[];
  disabled: boolean;
  onSave: (config: AgentConfiguration) => Promise<void>;
}) {
  const preferences = useModelPreferences();
  const choices = providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter(
        (model) =>
          preferences.models.includes(`${provider.id}/${model.id}`) ||
          (session.model?.provider === provider.id &&
            session.model.modelId === model.id),
      ),
    }))
    .filter((provider) => provider.models.length);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const provider = providers.find(
    (item) => item.id === session.model?.provider,
  );
  const model = provider?.models.find(
    (item) => item.id === session.model?.modelId,
  );
  async function save(config: AgentConfiguration) {
    setWorking(true);
    setError("");
    try {
      await onSave(config);
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setWorking(false);
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
        aria-label="Choose model and thinking level"
      >
        <span className="max-w-48 truncate">
          {model?.name ?? session.model?.modelId ?? "Choose a model"} ·{" "}
          {session.thinkingLevel ?? "off"}
        </span>
        <ChevronDownIcon
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] gap-3 p-3"
      >
        <PopoverTitle>Model</PopoverTitle>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <section
          className="max-h-56 overflow-y-auto"
          aria-label="Available models"
        >
          {choices.map((item) => (
            <section key={item.id}>
              {choices.length > 1 && (
                <h3 className="px-2 py-1 text-[10px] uppercase text-muted-foreground">
                  {item.name}
                </h3>
              )}
              {item.models.map((choice) => {
                const selected =
                  provider?.id === item.id && model?.id === choice.id;
                return (
                  <button
                    type="button"
                    key={choice.id}
                    aria-pressed={selected}
                    className={`flex w-full items-center justify-between gap-2 p-2 text-left text-xs hover:bg-accent ${selected ? "bg-accent font-medium" : ""}`}
                    disabled={disabled || working}
                    onClick={() => {
                      if (!selected)
                        void save({
                          provider: item.id,
                          model: choice.id,
                          thinkingLevel: choice.thinkingLevels.includes(
                            session.thinkingLevel,
                          )
                            ? session.thinkingLevel
                            : (choice.thinkingLevels[0] ?? "off"),
                        });
                    }}
                  >
                    {choice.name}
                    {selected && (
                      <CheckIcon className="size-3" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </section>
          ))}
        </section>
        {!choices.length && (
          <Link
            className="text-xs underline"
            href={
              providers.length
                ? "/settings?section=models"
                : "/settings?section=providers"
            }
          >
            {providers.length
              ? "Choose models in Settings"
              : "Connect a provider"}
          </Link>
        )}
        {model && (
          <ThinkingLevel
            key={`${provider?.id}/${model.id}`}
            levels={model.thinkingLevels.filter(
              (level) =>
                preferences.thinkingLevels.includes(level) ||
                level === session.thinkingLevel,
            )}
            value={session.thinkingLevel ?? "off"}
            disabled={disabled || working}
            onSave={(thinkingLevel) =>
              save({
                provider: provider?.id ?? "",
                model: model.id,
                thinkingLevel,
              })
            }
          />
        )}
        {(working || disabled) && (
          <p role="status" className="text-xs text-muted-foreground">
            {working ? "Saving…" : "Available when this conversation is idle."}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ThinkingLevel({
  levels,
  value,
  disabled,
  onSave,
}: {
  levels: string[];
  value: string;
  disabled: boolean;
  onSave: (level: string) => Promise<boolean>;
}) {
  const [index, setIndex] = useState(Math.max(0, levels.indexOf(value)));
  const changed = useRef(false);
  const levelsKey = levels.join(",");
  useEffect(() => {
    setIndex(Math.max(0, levelsKey.split(",").indexOf(value)));
    changed.current = false;
  }, [value, levelsKey]);
  function commit() {
    if (!changed.current || disabled) return;
    changed.current = false;
    const next = levels[index];
    if (next && next !== value)
      void onSave(next).then((saved) => {
        if (!saved) setIndex(Math.max(0, levels.indexOf(value)));
      });
  }
  return (
    <div className="space-y-2 border-t pt-3">
      <label
        htmlFor="composer-thinking"
        className="flex justify-between text-xs"
      >
        <span>Thinking</span>
        <span className="font-medium capitalize">{levels[index] ?? value}</span>
      </label>
      {levels.length > 1 && (
        <input
          id="composer-thinking"
          aria-label="Thinking level"
          aria-valuetext={levels[index] ?? value}
          type="range"
          min={0}
          max={levels.length - 1}
          step={1}
          value={index}
          disabled={disabled}
          className="w-full accent-foreground"
          onChange={(event) => {
            changed.current = true;
            setIndex(Number(event.target.value));
          }}
          onPointerUp={commit}
          onKeyUp={(event) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(event.key)
            )
              commit();
          }}
          onBlur={commit}
        />
      )}
      {levels.length > 1 && (
        <div
          aria-hidden="true"
          className="flex justify-between text-[10px] capitalize text-muted-foreground"
        >
          <span>{levels[0]}</span>
          <span>{levels.at(-1)}</span>
        </div>
      )}
    </div>
  );
}
