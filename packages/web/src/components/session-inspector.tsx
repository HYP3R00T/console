"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { useModelPreferences } from "@/components/model-preferences";
import { SandboxSettings } from "@/components/sandbox-settings";
import { Button } from "@/components/ui/button";
import type {
  AgentConfiguration,
  Conversation,
  Provider,
  SandboxPolicy,
} from "@/lib/console-api";

export function SessionInspector({
  session,
  providers: catalog,
  disabled,
  onSave,
  onDirtyChange,
  onSandboxSave,
  onSandboxDirtyChange,
}: {
  session: Conversation;
  providers: Provider[];
  disabled: boolean;
  onSave: (input: AgentConfiguration) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onSandboxSave: (policy: SandboxPolicy) => Promise<void>;
  onSandboxDirtyChange: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const preferences = useModelPreferences();
  const providers = catalog.map((provider) => ({
    ...provider,
    models: provider.models
      .filter(
        (model) =>
          preferences.models.includes(`${provider.id}/${model.id}`) ||
          (session.model?.provider === provider.id &&
            session.model.modelId === model.id),
      )
      .map((model) => ({
        ...model,
        thinkingLevels: model.thinkingLevels.filter(
          (level) =>
            preferences.thinkingLevels.includes(level) ||
            level === session.thinkingLevel,
        ),
      })),
  }));
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
    <aside className="space-y-6 p-5" aria-label="Session inspector">
      <header className="flex items-center gap-2">
        <SlidersHorizontalIcon
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="font-semibold">Session configuration</h2>
      </header>
      {!providers.some((item) => item.configured) && (
        <p className="text-sm text-muted-foreground">
          No providers connected.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              router.push("/settings?section=providers");
            }}
          >
            Manage connections
          </button>{" "}
          on this machine first.
        </p>
      )}
      <button
        type="button"
        className="text-xs underline"
        onClick={() => {
          router.push("/settings?section=models");
        }}
      >
        Manage model choices
      </button>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(draft);
        }}
      >
        <div className="block space-y-2 text-sm">
          Provider
          <ChoiceSelect
            label="Provider"
            value={draft.provider}
            disabled={disabled}
            placeholder="Choose a connected provider"
            items={providers
              .filter((item) => item.configured)
              .map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) =>
              setDraft({ provider: value, model: "", thinkingLevel: "off" })
            }
          />
        </div>
        <div className="block space-y-2 text-sm">
          Model
          <ChoiceSelect
            label="Model"
            value={draft.model}
            disabled={disabled || !provider?.configured}
            placeholder="Choose a model"
            items={
              provider?.configured
                ? provider.models.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))
                : []
            }
            onChange={(value) => {
              const next = provider?.models.find((item) => item.id === value);
              setDraft({
                ...draft,
                model: value,
                thinkingLevel: next?.thinkingLevels.includes(
                  draft.thinkingLevel,
                )
                  ? draft.thinkingLevel
                  : (next?.thinkingLevels[0] ?? "off"),
              });
            }}
          />
        </div>
        <div className="block space-y-2 text-sm">
          Thinking level
          <ChoiceSelect
            label="Thinking level"
            value={draft.thinkingLevel}
            disabled={disabled || !model || model.thinkingLevels.length < 2}
            items={(model?.thinkingLevels ?? [draft.thinkingLevel]).map(
              (level) => ({ value: level, label: level }),
            )}
            onChange={(value) => setDraft({ ...draft, thinkingLevel: value })}
          />
        </div>
        {model && (
          <p className="text-xs text-muted-foreground">
            Model context capacity: {model.contextWindow.toLocaleString()}{" "}
            tokens. Thinking choices come from Pi's model catalog.
          </p>
        )}
        {provider && !provider.configured && (
          <p className="text-xs text-muted-foreground">
            <button
              type="button"
              className="underline"
              onClick={() => {
                router.push("/settings?section=providers");
              }}
            >
              Connect this provider
            </button>{" "}
            before sending messages.
          </p>
        )}
        <Button
          className="w-full"
          type="submit"
          disabled={disabled || !provider?.configured || !model || !dirty}
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
        <h3 className="text-sm font-medium">Enabled tools</h3>
        <p className="wrap-break-word text-xs leading-relaxed text-muted-foreground">
          {session.enabledTools?.length
            ? session.enabledTools.join(", ")
            : "None. Configure a workspace and explicit permissions under Sandbox to enable file tools."}
        </p>
      </section>
      <SandboxSettings
        policy={session.sandbox}
        fixedWorkspace={Boolean(session.workspaceId)}
        disabled={disabled}
        onSave={onSandboxSave}
        onDirtyChange={onSandboxDirtyChange}
      />
    </aside>
  );
}
