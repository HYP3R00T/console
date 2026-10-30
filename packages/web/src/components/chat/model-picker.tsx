"use client";

import { ArrowLeftIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { ModelMetadata } from "@/components/models/model-metadata";
import { useModelPreferences } from "@/components/models/preferences";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AgentConfiguration, Provider } from "@/lib/api";
import { visibleModelGroups } from "@/lib/chat/model-catalog";
import { modelThinking } from "@/lib/chat/thinking";

export function ComposerModelPicker({
  value,
  providers,
  disabled,
  onChange,
}: {
  value?: AgentConfiguration;
  providers: Provider[];
  disabled: boolean;
  onChange: (config: AgentConfiguration) => void;
}) {
  const preferences = useModelPreferences();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"settings" | "models">("settings");
  const [opened, setOpened] = useState(value);
  const slider = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const settings = useRef<HTMLButtonElement>(null);
  const provider = providers.find((item) => item.id === value?.provider);
  const model = provider?.models.find((item) => item.id === value?.model);
  const thinking = modelThinking(model, value?.thinkingLevel);
  const modelName = model?.name ?? value?.model ?? "Choose model";
  const choices = visibleModelGroups(
    providers,
    preferences.models,
    value,
    opened,
  );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpened(value);
          setView(model ? "settings" : "models");
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        aria-label="Choose model and thinking level"
        title={`${modelName}${thinking.available ? ` · ${thinking.level}` : ""}`}
        className="flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
      >
        <span className="min-w-0 truncate text-left">{modelName}</span>
        {thinking.available && (
          <span className="shrink-0 capitalize text-muted-foreground">
            {thinking.level}
          </span>
        )}
        <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 max-w-[calc(100vw-2rem)] gap-3 rounded-xl p-3 shadow-xl"
      >
        <PopoverTitle className="sr-only">Model and thinking</PopoverTitle>
        {view === "models" ? (
          <>
            <button
              ref={back}
              type="button"
              className="flex h-7 items-center gap-2 px-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setView("settings");
                requestAnimationFrame(() => settings.current?.focus());
              }}
              disabled={!model}
            >
              <ArrowLeftIcon className="size-3.5" />
              Choose model
            </button>
            <section
              aria-label="Available models"
              className="max-h-64 overflow-y-auto"
            >
              {choices.map((item) => (
                <div key={item.id}>
                  <p className="px-2 py-1 text-[10px] text-muted-foreground">
                    {item.name}
                  </p>
                  {item.models.map((choice) => {
                    const selected =
                      item.id === provider?.id && choice.id === model?.id;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        className={`flex min-h-12 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-accent ${selected ? "bg-accent" : ""}`}
                        onClick={() => {
                          const next = modelThinking(
                            choice,
                            value?.thinkingLevel,
                          );
                          onChange({
                            provider: item.id,
                            model: choice.id,
                            thinkingLevel: next.level,
                          });
                          setView("settings");
                          if (!next.available) setOpen(false);
                          else
                            requestAnimationFrame(() =>
                              slider.current?.focus(),
                            );
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{choice.name}</span>
                          <ModelMetadata model={choice} />
                        </span>
                        <CheckIcon
                          aria-hidden="true"
                          className={`size-3.5 shrink-0 ${selected ? "" : "invisible"}`}
                        />
                      </button>
                    );
                  })}
                </div>
              ))}
            </section>
            {!choices.length && (
              <Link
                href={
                  providers.length
                    ? "/settings?section=models"
                    : "/settings?section=providers"
                }
                className="px-2 py-2 text-xs underline"
              >
                {providers.length
                  ? "Choose models in Settings"
                  : "Connect a provider"}
              </Link>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              ref={settings}
              aria-label="Choose model"
              disabled={disabled}
              className="flex min-h-8 items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-accent"
              onClick={() => {
                setView("models");
                requestAnimationFrame(() => back.current?.focus());
              }}
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {modelName}
              </span>
              <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
            </button>
            {thinking.available ? (
              <div className="space-y-3 border-t border-border/60 px-1 pt-3">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Thinking</span>
                  <span className="capitalize">{thinking.level}</span>
                </div>
                {!thinking.levels.includes("off") && (
                  <p className="text-[11px] text-muted-foreground">
                    Thinking is required for this model; Off is unavailable.
                  </p>
                )}
                {thinking.adjustable ? (
                  <>
                    <input
                      ref={slider}
                      aria-label="Thinking level"
                      aria-valuetext={thinking.level}
                      type="range"
                      min={0}
                      max={thinking.levels.length - 1}
                      step={1}
                      value={thinking.levels.indexOf(thinking.level)}
                      disabled={disabled}
                      className="block h-4 w-full accent-foreground"
                      onChange={(event) => {
                        const thinkingLevel =
                          thinking.levels[Number(event.target.value)];
                        if (value && thinkingLevel)
                          onChange({ ...value, thinkingLevel });
                      }}
                    />
                    <div
                      aria-hidden="true"
                      className="flex flex-wrap justify-between gap-1 text-[10px] capitalize text-muted-foreground"
                    >
                      {thinking.levels.map((level) => (
                        <span key={level}>{level}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Thinking is fixed for this model.
                  </p>
                )}
              </div>
            ) : (
              <p className="px-2 text-xs text-muted-foreground">
                This model has no thinking control.
              </p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
