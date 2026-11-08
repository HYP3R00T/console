"use client";

import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useCommands } from "@/components/commands/command-registry";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBackendRequest } from "@/hooks/use-backend-request";
import {
  modelKey,
  type RuntimeDefaults,
  type RuntimeDefaultsSnapshot,
} from "../sessions/use-chat-models";

const path = "/v1/machine/runtime-defaults";
const none = "none";
const automatic = "automatic";
type Edit = { revision: number; defaults: RuntimeDefaults | null };

export function RuntimeSettings() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { client, request } = useBackendRequest();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Runtime defaults</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Model and thinking level for new conversations on this machine.
        </p>
      </header>
      {client ? (
        <DefaultsForm key={deviceId} request={request} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect this machine from Manage devices.
        </p>
      )}
    </div>
  );
}

function DefaultsForm({
  request,
}: {
  request: ReturnType<typeof useBackendRequest>["request"];
}) {
  const commands = useCommands();
  const [snapshot, setSnapshot] = useState<RuntimeDefaultsSnapshot>();
  const [edit, setEdit] = useState<Edit>();
  const [loadError, setLoadError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = await request<RuntimeDefaultsSnapshot>(path, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setSnapshot((current) =>
          current && current.revision > data.revision ? current : data,
        );
        setLoadError(undefined);
      } catch (cause) {
        if (!controller.signal.aborted)
          setLoadError(
            cause instanceof Error ? cause.message : "Could not load defaults.",
          );
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void load(), 10000);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [request]);
  if (!snapshot)
    return loadError ? (
      <p role="alert" className="text-sm text-destructive">
        {loadError}
      </p>
    ) : (
      <p role="status" className="text-sm text-muted-foreground">
        Loading runtime defaults…
      </p>
    );
  const defaults = edit ? edit.defaults : snapshot.defaults;
  const key = defaults
    ? modelKey({
        provider: defaults.model.provider,
        id: defaults.model.modelId,
      })
    : none;
  const selected = snapshot.models.find((model) => modelKey(model) === key);
  const { revision } = snapshot;
  const stale = !!edit && edit.revision !== revision;
  function change(next: RuntimeDefaults | null) {
    setError(undefined);
    setEdit({ revision: edit?.revision ?? revision, defaults: next });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!edit || stale || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const saved = (await commands.invoke(
        "machine.runtime-defaults.update",
        edit,
      )) as Edit;
      setSnapshot((current) =>
        current && saved.revision >= current.revision
          ? { ...current, ...saved }
          : current,
      );
      setEdit(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save defaults.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="runtime-model">Default model</FieldLabel>
          <Select
            value={key}
            disabled={busy}
            onValueChange={(value) => {
              if (value === none) change(null);
              const model = snapshot.models.find(
                (item) => modelKey(item) === value,
              );
              if (model)
                change({
                  model: { provider: model.provider, modelId: model.id },
                });
            }}
          >
            <SelectTrigger id="runtime-model">
              <SelectValue>
                {selected
                  ? `${selected.name} (${selected.provider})`
                  : defaults
                    ? `${defaults.model.modelId} (unavailable)`
                    : "No machine default"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={none}>No machine default</SelectItem>
                {snapshot.models.map((model) => (
                  <SelectItem key={modelKey(model)} value={modelKey(model)}>
                    {model.name} ({model.provider})
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Choose a favorite from an enabled provider. Existing conversations
            keep their saved settings.
          </FieldDescription>
        </Field>
        {defaults &&
          selected?.reasoning &&
          selected.thinkingLevels.length > 0 && (
            <Field>
              <FieldLabel htmlFor="runtime-thinking">
                Default thinking level
              </FieldLabel>
              <Select
                value={defaults.thinkingLevel ?? automatic}
                disabled={busy}
                onValueChange={(level) => {
                  if (level)
                    change({
                      ...defaults,
                      thinkingLevel: level === automatic ? undefined : level,
                    });
                }}
              >
                <SelectTrigger id="runtime-thinking">
                  <SelectValue>
                    {defaults.thinkingLevel ?? "Model default"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={automatic}>Model default</SelectItem>
                    {selected.thinkingLevels.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
      </FieldGroup>
      {(stale || error || loadError) && (
        <p role="alert" className="text-sm text-destructive">
          {stale
            ? "Defaults changed on this machine. Discard your edits to see the latest settings."
            : (error ?? loadError)}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={!edit || stale || busy || (!!defaults && !selected)}
        >
          {busy ? "Saving…" : "Save defaults"}
        </Button>
        {edit && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setEdit(undefined);
              setError(undefined);
            }}
          >
            Discard edits
          </Button>
        )}
      </div>
    </form>
  );
}
