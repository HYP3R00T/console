"use client";

import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import type { useChatModels } from "./use-chat-models";

export function ChatModelControl({
  models,
  disabled,
  label = "Model and thinking",
}: {
  models: ReturnType<typeof useChatModels>;
  disabled: boolean;
  label?: string;
}) {
  const [list, setList] = useState(false);
  const focusControl = useCallback(
    (element: HTMLElement | null) => element?.focus(),
    [],
  );
  const levels = models.model?.reasoning ? models.model.thinkingLevels : [];
  const name =
    models.model?.name ?? (!models.loaded ? "Loading models…" : "Choose model");
  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setList(false);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={label}
            disabled={disabled || !models.models.length}
            className="min-w-0 max-w-full shrink gap-1 rounded-full px-2 text-xs"
          />
        }
      >
        <span className="truncate">{name}</span>
        {levels.length > 0 && (
          <span className="capitalize text-muted-foreground">
            {models.level}
          </span>
        )}
        <ChevronDown className="size-3" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-72 max-w-[calc(100vw-2rem)] gap-3 p-2"
      >
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        {list ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => setList(false)}
            >
              <ArrowLeft className="size-3.5" />
              Models
            </Button>
            <Command
              tabIndex={0}
              aria-label="Available models"
              defaultValue={models.selected}
              ref={focusControl}
            >
              <CommandList>
                {models.models.map((model) => (
                  <CommandItem
                    key={models.keyOf(model)}
                    value={models.keyOf(model)}
                    data-checked={models.selected === models.keyOf(model)}
                    onSelect={() => {
                      models.chooseModel(models.keyOf(model));
                      setList(false);
                    }}
                  >
                    <span className="truncate">{model.name}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-between"
              ref={focusControl}
              aria-label="Choose model"
              onClick={() => setList(true)}
            >
              <span className="truncate">{name}</span>
              <ChevronRight className="size-3.5" />
            </Button>
            {levels.length > 0 ? (
              <div className="space-y-3 px-2 pb-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Thinking</span>
                  <span className="capitalize">{models.level}</span>
                </div>
                <Slider
                  min={0}
                  max={Math.max(1, levels.length - 1)}
                  step={1}
                  value={[Math.max(0, levels.indexOf(models.level ?? ""))]}
                  disabled={disabled || levels.length === 1}
                  onValueChange={(value) => {
                    const index = Array.isArray(value) ? value[0] : value;
                    if (levels[index]) models.chooseLevel(levels[index]);
                  }}
                  thumbProps={{
                    getAriaLabel: () => "Thinking effort",
                    getAriaValueText: (_formatted, value) =>
                      levels[value] ?? "",
                  }}
                />
                <div className="flex justify-between text-xs capitalize text-muted-foreground">
                  <span>{levels[0]}</span>
                  <span>{levels.at(-1)}</span>
                </div>
              </div>
            ) : (
              <p className="px-2 pb-2 text-xs text-muted-foreground">
                No adjustable thinking level.
              </p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
