"use client";
import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBackend } from "@/components/machines/connection-context";
import { ModelMetadata } from "@/components/models/model-metadata";
import { Button } from "@/components/ui/button";
import { api, type Provider } from "@/lib/api";
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
export function ModelPreferencesSettings({
  active = true,
}: {
  active?: boolean;
}) {
  const { id, connections } = useBackend();
  const current = useModelPreferences();
  const [draft, setDraft] = useState<ModelPreferences>();
  const selected = draft ?? current;
  const [providers, setProviders] = useState<Provider[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const request = useRef<AbortController | null>(null);
  const loadCatalog = useCallback(() => {
    if (!id || !active) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    void api<Provider[]>(
      "/providers?connected=true",
      "GET",
      undefined,
      controller.signal,
    )
      .then((items) => {
        if (!controller.signal.aborted) {
          setProviders(items);
          setMessage("");
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setMessage(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [id, active]);
  useEffect(() => {
    loadCatalog();
    return () => request.current?.abort();
  }, [loadCatalog]);
  const query = search.trim().toLowerCase();
  const groups = providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter((model) =>
        `${provider.name} ${provider.id} ${model.name} ${model.id}`
          .toLowerCase()
          .includes(query),
      ),
    }))
    .filter((provider) => provider.models.length);
  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Model menu</h2>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg"
            disabled={loading}
            onClick={loadCatalog}
          >
            <RefreshCwIcon className="size-3.5" />
            Reload catalog
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Catalog from{" "}
          {connections.find((item) => item.id === id)?.name ??
            "the selected machine"}
          . Expand a provider to choose models for your composer. Menu choices
          are shared by this web app; credentials and defaults belong to each
          machine.
        </p>
      </header>
      <input
        aria-label="Search available models"
        placeholder="Find a model or provider…"
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setExpanded({});
        }}
      />
      {loading && !providers.length && (
        <p className="text-xs text-muted-foreground">
          Loading provider catalogs…
        </p>
      )}
      <div className="space-y-3">
        {groups.map((provider) => {
          const open = expanded[provider.id] ?? Boolean(query);
          const chosen = provider.models.filter((model) =>
            selected.models.includes(`${provider.id}/${model.id}`),
          ).length;
          return (
            <section
              key={provider.id}
              className="overflow-hidden rounded-xl border border-border/70"
            >
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`catalog-${provider.id}`}
                className="flex min-h-14 w-full items-center gap-3 bg-muted/20 px-4 text-left"
                onClick={() =>
                  setExpanded((value) => ({ ...value, [provider.id]: !open }))
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {provider.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {chosen} selected · {provider.models.length}{" "}
                    {provider.models.length === 1 ? "model" : "models"}
                  </span>
                </span>
                <ChevronDownIcon
                  className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>
              <div
                id={`catalog-${provider.id}`}
                hidden={!open}
                className="max-h-[32rem] overflow-y-auto divide-y border-t"
              >
                {open &&
                  provider.models.map((model) => {
                    const key = `${provider.id}/${model.id}`;
                    return (
                      <label
                        key={model.id}
                        className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-accent/40"
                        title={model.id}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.models.includes(key)}
                          disabled={working}
                          onChange={() =>
                            setDraft((value) => {
                              const next = value ?? current;
                              return {
                                ...next,
                                models: next.models.includes(key)
                                  ? next.models.filter((item) => item !== key)
                                  : [...next.models, key],
                              };
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="text-sm">{model.name}</span>
                          <ModelMetadata model={model} full />
                        </span>
                      </label>
                    );
                  })}
              </div>
            </section>
          );
        })}
      </div>
      {!loading && !groups.length && (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          {providers.length
            ? "No catalog models match this search."
            : "Connect a provider on this machine to choose its models."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          className="rounded-lg"
          disabled={working || !draft}
          onClick={async () => {
            setWorking(true);
            try {
              await api("/backends/preferences", "PATCH", selected);
              window.dispatchEvent(new Event("console:preferences-changed"));
              setMessage("Model menu updated.");
            } catch (cause) {
              setMessage((cause as Error).message);
            } finally {
              setWorking(false);
            }
          }}
        >
          Save model menu
        </Button>
        {message && (
          <p role="status" className="text-xs text-muted-foreground">
            {message}
          </p>
        )}
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        Only this machine's published provider catalogs are shown. Thinking
        levels come from Pi AI; models that require thinking do not offer Off. A
        CLI using a different catalog can show different models.
      </p>
    </section>
  );
}
