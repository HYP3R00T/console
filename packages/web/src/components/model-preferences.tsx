"use client";
import { useEffect, useState } from "react";
import { useBackend } from "@/components/connection-context";
import { Button } from "@/components/ui/button";
import { api, type Provider } from "@/lib/console-api";
export type ModelPreferences = { models: string[]; thinkingLevels: string[] };
export const defaultPreferences: ModelPreferences = {
  models: [],
  thinkingLevels: ["off", "low", "medium", "high"],
};
export function useModelPreferences() {
  const [value, setValue] = useState(defaultPreferences);
  useEffect(() => {
    let active = true;
    const read = () => {
      void api<ModelPreferences>("/backends/preferences")
        .then((value) => {
          if (active) setValue(value);
        })
        .catch(() => {});
    };
    read();
    window.addEventListener("console:preferences-changed", read);
    return () => {
      active = false;
      window.removeEventListener("console:preferences-changed", read);
    };
  }, []);
  return value;
}
export function ModelPreferencesSettings() {
  const { id } = useBackend();
  const current = useModelPreferences();
  const [draft, setDraft] = useState(current);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setDraft(current), [current]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void api<Provider[]>(
      "/providers?connected=true",
      "GET",
      undefined,
      controller.signal,
    )
      .then(setProviders)
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [id]);
  const toggle = (key: keyof ModelPreferences, value: string) =>
    setDraft((draft) => ({
      ...draft,
      [key]: draft[key].includes(value)
        ? draft[key].filter((item) => item !== value)
        : [...draft[key], value],
    }));
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold">Model choices</h2>
      <p className="text-sm text-muted-foreground">
        Choose the models and thinking levels offered in chat. Choices apply
        across machines; provider connections belong to each machine. The
        current model stays visible.
      </p>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-3 text-sm">Thinking levels</legend>
        {["off", "minimal", "low", "medium", "high", "xhigh"].map((level) => (
          <label key={level} className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.thinkingLevels.includes(level)}
              onChange={() => toggle("thinkingLevels", level)}
            />
            {level}
          </label>
        ))}
      </fieldset>
      <input
        aria-label="Search available models"
        placeholder="Search available models…"
        className="w-full border bg-background p-2"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-80 space-y-4 overflow-auto">
        {!id && <p>Connect a machine to choose its models.</p>}
        {providers.map((provider) => (
          <fieldset key={provider.id}>
            <legend className="mb-2 font-medium">{provider.name}</legend>
            {provider.models
              .filter((model) =>
                `${model.name} ${model.id}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((model) => (
                <label key={model.id} className="flex gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.models.includes(
                      `${provider.id}/${model.id}`,
                    )}
                    onChange={() =>
                      toggle("models", `${provider.id}/${model.id}`)
                    }
                  />
                  {model.name}
                </label>
              ))}
          </fieldset>
        ))}
      </div>
      <Button
        disabled={!draft.thinkingLevels.length}
        onClick={async () => {
          try {
            await api("/backends/preferences", "PATCH", draft);
            window.dispatchEvent(new Event("console:preferences-changed"));
            setMessage("Saved.");
          } catch (error) {
            setMessage((error as Error).message);
          }
        }}
      >
        Save choices
      </Button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  );
}
