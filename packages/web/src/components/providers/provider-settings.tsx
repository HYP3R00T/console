"use client";

import { ChevronRight, Star } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useDevices } from "@/components/devices/device-provider";
import { ModelDetails } from "@/components/providers/model-details";
import { ProviderLogin } from "@/components/providers/provider-login";
import { useProviders } from "@/components/providers/providers-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  type LoginView,
  type ProviderModel,
  providerPath,
} from "@/lib/providers";
import { cn } from "@/lib/utils";

export function ProviderSettings() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { devices, ready } = useDevices();
  const { origin } = useProviders();
  const device = devices.find((d) => d.id === deviceId);
  if (!ready) return <p>Loading device…</p>;
  if (!device) return <h1>Device not found</h1>;
  if (origin !== device.url)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Providers</h1>
        <p className="text-sm text-muted-foreground">
          Connect this device from the device panel.
        </p>
      </div>
    );
  return <ProviderSettingsContent key={origin} />;
}
function ProviderSettingsContent() {
  const { overview, error: loadError, refresh, request } = useProviders();
  const [providerSearch, setProviderSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [modelData, setModelData] = useState<{
    provider: string;
    models: ProviderModel[];
  }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [configuredOnly, setConfiguredOnly] = useState(false);
  const [login, setLogin] = useState<{ flow: LoginView; name: string }>();
  const providers = overview?.providers ?? [];
  const selected =
    providers.find(
      (p) =>
        p.id ===
        (selectedId ?? providers.find((p) => p.configured)?.id ?? "openai"),
    ) ?? providers[0];
  const models =
    modelData?.provider === selected?.id ? modelData.models : undefined;
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void request<{ models: ProviderModel[] }>(
      `${providerPath(selected.id)}/models`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted)
          setModelData({ provider: selected.id, models: data.models });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Could not load models.",
          );
      });
    return () => controller.abort();
  }, [selected, request]);
  async function action(operation: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await operation();
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Provider operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const visibleProviders = providers
    .filter(
      (p) =>
        (!configuredOnly || p.configured) &&
        `${p.name} ${p.id}`
          .toLowerCase()
          .includes(providerSearch.toLowerCase()),
    )
    .sort((a, b) => Number(b.configured) - Number(a.configured));
  const visibleModels = (models ?? [])
    .filter((m) =>
      `${m.name} ${m.id} ${m.input.join(" ")} ${m.thinkingLevels.join(" ")}`
        .toLowerCase()
        .includes(modelSearch.toLowerCase()),
    )
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  return (
    <div className="flex flex-col gap-6 xl:min-h-0 xl:flex-1">
      <header className="shrink-0">
        <h1 className="text-xl font-semibold">Providers</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {overview?.activeCount ?? 0} enabled · Credentials and model favorites
          are stored on this backend.
        </p>
      </header>
      {(error || loadError) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? loadError}
        </p>
      )}
      <div className="grid min-h-0 gap-6 xl:flex-1 xl:grid-cols-[320px_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]">
        <section
          aria-label="Provider catalog"
          className="flex min-h-0 min-w-0 flex-col gap-3"
        >
          <Input
            aria-label="Search providers"
            className="shrink-0 border-0 bg-muted/40 shadow-none"
            placeholder="Search providers"
            value={providerSearch}
            onChange={(event) => setProviderSearch(event.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 self-start"
            aria-pressed={configuredOnly}
            onClick={() => setConfiguredOnly(!configuredOnly)}
          >
            Configured only
          </Button>
          <ScrollArea
            className="h-64 min-h-0 xl:h-auto xl:flex-1"
            aria-label="Providers"
          >
            <div className="pr-4">
              {visibleProviders.map((p) => (
                <Button
                  key={p.id}
                  variant="ghost"
                  className={cn(
                    "h-auto w-full justify-between px-3 py-3 text-left",
                    selected?.id === p.id && "bg-sidebar-accent",
                  )}
                  aria-pressed={selected?.id === p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    setModelSearch("");
                    setError(undefined);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {p.name}
                    </span>
                    <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                      {p.configured
                        ? p.enabled
                          ? "Enabled · credentials saved"
                          : "Disabled · credentials saved"
                        : "Not configured"}
                    </span>
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {p.modelCount}
                  </span>
                </Button>
              ))}
              {overview && visibleProviders.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">
                  No matching providers.
                </p>
              )}
              {!overview && !loadError && (
                <p className="text-sm text-muted-foreground">
                  Loading providers…
                </p>
              )}
            </div>
          </ScrollArea>
        </section>
        {selected && (
          <section
            aria-label={`${selected.name} provider`}
            className="flex min-h-0 min-w-0 flex-col gap-6"
          >
            <div className="shrink-0 space-y-4 bg-muted/20 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-medium">{selected.name}</h2>
                <Badge variant="outline">
                  {selected.configured
                    ? selected.enabled
                      ? "Enabled"
                      : "Disabled"
                    : "Not configured"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.methods.map((method) => (
                  <Button
                    key={method.type}
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const flow = await request<LoginView>(
                          `${providerPath(selected.id)}/login`,
                          {
                            method: "POST",
                            body: JSON.stringify({ type: method.type }),
                          },
                        );
                        setLogin({ flow, name: selected.name });
                      })
                    }
                  >
                    {method.label}
                  </Button>
                ))}
                {selected.configured && (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          request(providerPath(selected.id), {
                            method: "PUT",
                            body: JSON.stringify({
                              enabled: !selected.enabled,
                            }),
                          }),
                        )
                      }
                    >
                      {selected.enabled
                        ? "Disconnect provider"
                        : "Reconnect provider"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          request(providerPath(selected.id), {
                            method: "DELETE",
                          }),
                        )
                      }
                    >
                      Remove provider
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Configured means credentials are saved; model access has not
                been tested. Disconnect keeps credentials and favorites. Remove
                clears both.
              </p>
              {!selected.methods.length && (
                <p className="text-xs text-muted-foreground">
                  Interactive sign-in is not offered by this provider.
                </p>
              )}
            </div>
            <div className="flex min-h-0 flex-col gap-3 xl:flex-1">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-medium">
                  Models · {models?.length ?? "…"}
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !selected.enabled}
                  onClick={() =>
                    void action(async () => {
                      const data = await request<{ models: ProviderModel[] }>(
                        `${providerPath(selected.id)}/refresh`,
                        { method: "POST" },
                      );
                      setModelData({
                        provider: selected.id,
                        models: data.models,
                      });
                    })
                  }
                >
                  Refresh catalog
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Star models for the future chat picker. Only enabled, available
                favorites will be offered. Catalog metadata is not an account
                entitlement check.
              </p>
              <Input
                aria-label="Search models"
                className="shrink-0 border-0 bg-muted/40 shadow-none"
                placeholder="Search models or capabilities"
                value={modelSearch}
                onChange={(event) => setModelSearch(event.target.value)}
              />
              <ScrollArea
                className="h-[60vh] min-h-0 xl:h-auto xl:flex-1"
                aria-label="Models"
              >
                {visibleModels.map((model) => (
                  <Collapsible
                    key={`${selected.id}/${model.id}`}
                    className="group/model"
                  >
                    <div className="flex items-center group-hover/model:bg-muted/30">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label={`${model.favorite ? "Unfavorite" : "Favorite"} ${model.name}`}
                        aria-pressed={model.favorite}
                        onClick={() =>
                          void action(async () => {
                            await request(
                              `${providerPath(selected.id)}/models/${encodeURIComponent(model.id)}/favorite`,
                              {
                                method: "PUT",
                                body: JSON.stringify({
                                  favorite: !model.favorite,
                                }),
                              },
                            );
                            setModelData((previous) =>
                              previous?.provider === selected.id
                                ? {
                                    ...previous,
                                    models: previous.models.map((m) =>
                                      m.id === model.id
                                        ? { ...m, favorite: !m.favorite }
                                        : m,
                                    ),
                                  }
                                : previous,
                            );
                          })
                        }
                      >
                        <Star
                          className={model.favorite ? "fill-current" : ""}
                        />
                      </Button>
                      <CollapsibleTrigger
                        render={
                          <Button
                            variant="ghost"
                            className="navigation-row group h-auto min-w-0 flex-1 justify-between px-3 py-3 text-left"
                          />
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {model.name}
                          </span>
                          <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
                            {model.id}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 group-aria-expanded:rotate-90" />
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <ModelDetails model={model} />
                    </CollapsibleContent>
                  </Collapsible>
                ))}
                {models && visibleModels.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">
                    No matching models.
                  </p>
                )}
              </ScrollArea>
            </div>
          </section>
        )}
      </div>
      {login && (
        <ProviderLogin
          key={login.flow.id}
          initial={login.flow}
          name={login.name}
          onDone={() => setLogin(undefined)}
        />
      )}
    </div>
  );
}
