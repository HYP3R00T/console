"use client";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  AgentConfiguration,
  Conversation,
  Provider,
} from "@/lib/console-api";

export function ComposerModelPicker({
  session,
  providers,
  disabled,
  onSave,
  onConfigure,
}: {
  session: Conversation;
  providers: Provider[];
  disabled: boolean;
  onSave: (config: AgentConfiguration) => Promise<void>;
  onConfigure: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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
    } catch (cause) {
      setError((cause as Error).message);
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
        className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-3"
      >
        <PopoverTitle>Model & thinking</PopoverTitle>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {!providers.length && (
          <Link href="/settings/providers" className="underline">
            Connect a provider on this machine
          </Link>
        )}
        <input
          aria-label="Search connected models"
          placeholder="Search connected models…"
          className="border bg-background p-2 text-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <section
          className="max-h-56 overflow-y-auto"
          aria-label="Connected models"
        >
          {providers.map((item) => (
            <section key={item.id}>
              <h3 className="p-2 text-[10px] uppercase text-muted-foreground">
                {item.name}
              </h3>
              {item.models
                .filter((choice) =>
                  `${choice.name} ${choice.id}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((choice) => (
                  <button
                    type="button"
                    key={choice.id}
                    aria-pressed={
                      provider?.id === item.id && model?.id === choice.id
                    }
                    className={`flex w-full justify-between gap-2 p-2 text-left text-xs hover:bg-accent ${provider?.id === item.id && model?.id === choice.id ? "bg-accent font-medium" : ""}`}
                    disabled={disabled || working}
                    onClick={() =>
                      void save({
                        provider: item.id,
                        model: choice.id,
                        thinkingLevel: choice.thinkingLevels.includes(
                          session.thinkingLevel,
                        )
                          ? session.thinkingLevel
                          : (choice.thinkingLevels[0] ?? "off"),
                      })
                    }
                  >
                    {choice.name}
                    <span>
                      {provider?.id === item.id && model?.id === choice.id
                        ? "✓"
                        : ""}
                    </span>
                  </button>
                ))}
            </section>
          ))}
        </section>
        <ChoiceSelect
          label="Thinking level"
          value={session.thinkingLevel ?? "off"}
          disabled={disabled || working || !model}
          items={(model?.thinkingLevels ?? ["off"]).map((level) => ({
            value: level,
            label: level,
          }))}
          onChange={(level) => {
            if (session.model)
              void save({
                provider: session.model.provider,
                model: session.model.modelId,
                thinkingLevel: level,
              });
          }}
        />
        <p role="status" className="text-muted-foreground">
          {working
            ? "Saving…"
            : disabled
              ? "Finish or cancel active work to change the model."
              : "Selections are saved immediately for this agent."}
        </p>
        <button
          type="button"
          className="border-t pt-2 text-left underline"
          onClick={() => {
            setOpen(false);
            onConfigure();
          }}
        >
          Workspace and tool permissions
        </button>
      </PopoverContent>
    </Popover>
  );
}
