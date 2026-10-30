"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useModelPreferences } from "@/components/models/preferences";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AgentConfiguration, Provider } from "@/lib/api";

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
  const [openedSelection, setOpenedSelection] = useState({
    model: value,
    level: value?.thinkingLevel ?? "off",
  });
  const choices = providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter(
        (model) =>
          preferences.models.includes(`${provider.id}/${model.id}`) ||
          (value?.provider === provider.id && value.model === model.id) ||
          (openedSelection.model?.provider === provider.id &&
            openedSelection.model.model === model.id),
      ),
    }))
    .filter((provider) => provider.models.length);
  const [open, setOpen] = useState(false);
  const provider = providers.find((item) => item.id === value?.provider);
  const model = provider?.models.find((item) => item.id === value?.model);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next)
          setOpenedSelection({
            model: value,
            level: value?.thinkingLevel ?? "off",
          });
        setOpen(next);
      }}
    >
      <PopoverTrigger
        className="flex w-56 max-w-full min-w-0 items-center justify-between gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
        aria-label="Choose model and thinking level"
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {model?.name ?? value?.model ?? "Choose a model"} ·{" "}
          {value?.thinkingLevel ?? "off"}
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
                    disabled={disabled}
                    onClick={() => {
                      if (!selected)
                        onChange({
                          provider: item.id,
                          model: choice.id,
                          thinkingLevel: choice.thinkingLevels.includes(
                            value?.thinkingLevel ?? "off",
                          )
                            ? (value?.thinkingLevel ?? "off")
                            : (choice.thinkingLevels[0] ?? "off"),
                        });
                    }}
                  >
                    <span className="min-w-0 truncate">{choice.name}</span>
                    <CheckIcon
                      className={`size-3 shrink-0 ${selected ? "" : "invisible"}`}
                      aria-hidden="true"
                    />
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
                level === value?.thinkingLevel ||
                level === openedSelection.level,
            )}
            value={value?.thinkingLevel ?? "off"}
            disabled={disabled}
            onChange={(thinkingLevel) =>
              onChange({
                provider: provider?.id ?? "",
                model: model.id,
                thinkingLevel,
              })
            }
          />
        )}
        <p className="h-4 shrink-0 truncate text-xs text-muted-foreground">
          {disabled ? "Available when this conversation is idle." : ""}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function ThinkingLevel({
  levels,
  value,
  disabled,
  onChange,
}: {
  levels: string[];
  value: string;
  disabled: boolean;
  onChange: (level: string) => void;
}) {
  const index = Math.max(0, levels.indexOf(value));
  return (
    <div className="min-h-20 space-y-2 border-t pt-3">
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
            const next = levels[Number(event.target.value)];
            if (next) onChange(next);
          }}
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
