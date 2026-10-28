"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProviderConnection } from "@/components/provider-connection";
import { Button } from "@/components/ui/button";
import { api, fieldClass, type Login, type Provider } from "@/lib/console-api";

export default function ProviderSettings() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("openai");
  const [login, setLogin] = useState<Login | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const provider = providers.find((item) => item.id === providerId);
  const loginId = login?.id;
  const loginStatus = login?.status;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<Provider[]>("/providers", "GET", undefined, controller.signal),
      api<Login | null>(
        "/connections/current",
        "GET",
        undefined,
        controller.signal,
      ),
    ])
      .then(([items, current]) => {
        setProviders(items);
        setLogin(current);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!loginId || loginStatus !== "pending") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const id = loginId;
    async function poll() {
      try {
        const current = await api<Login>(
          `/connections/${id}`,
          "GET",
          undefined,
          controller.signal,
        );
        setLogin(current);
        if (current.status === "pending") timer = setTimeout(poll, 700);
        else
          setProviders(
            await api<Provider[]>(
              "/providers",
              "GET",
              undefined,
              controller.signal,
            ),
          );
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      }
    }
    timer = setTimeout(poll, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [loginId, loginStatus]);

  async function act(operation: () => Promise<void>) {
    setWorking(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <Link href="/" className="text-sm text-muted-foreground underline">
        ← Conversation
      </Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Providers</h1>
        <p className="text-sm text-muted-foreground">
          Connections belong to this backend machine. Pi handles each provider's
          authentication flow.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <label className="block space-y-2">
        <span className="text-sm font-medium">Provider</span>
        <select
          className={fieldClass}
          value={providerId}
          onChange={(event) => setProviderId(event.target.value)}
        >
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.configured ? " · Configured" : ""}
            </option>
          ))}
        </select>
      </label>
      {provider && (
        <section className="space-y-4 rounded-lg border p-5">
          <h2 className="font-medium">{provider.name}</h2>
          <p className="text-sm text-muted-foreground">
            {provider.configured
              ? `Configured through ${provider.source}. Configuration does not verify model access.`
              : "Not configured."}
          </p>
          <div className="flex flex-wrap gap-3">
            {provider.configured && (
              <Button
                variant="outline"
                disabled={working || login?.status === "pending"}
                onClick={() =>
                  void act(async () => {
                    await api(`/providers/${provider.id}/refresh`, "POST");
                    setProviders(await api<Provider[]>("/providers"));
                  })
                }
              >
                Refresh models
              </Button>
            )}
            {provider.methods.map((method) => (
              <Button
                key={method.type}
                disabled={working || login?.status === "pending"}
                onClick={() =>
                  void act(async () => {
                    setLogin(
                      await api<Login>("/connections", "POST", {
                        provider: provider.id,
                        method: method.type,
                      }),
                    );
                  })
                }
              >
                {method.label}
              </Button>
            ))}
            {provider.configured && (
              <Button
                variant="outline"
                disabled={working || login?.status === "pending"}
                onClick={() =>
                  void act(async () => {
                    await api(`/providers/${provider.id}`, "DELETE");
                    setProviders(await api<Provider[]>("/providers"));
                    setLogin(null);
                  })
                }
              >
                Remove saved credentials
              </Button>
            )}
          </div>
          {!provider.methods.length && (
            <p className="text-sm">
              This provider uses machine environment or external credential
              configuration.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Environment credentials remain available after saved credentials are
            removed. Provider access and subscription conditions still apply.
          </p>
        </section>
      )}
      {login && (
        <ProviderConnection
          key={`${login.id}-${login.prompt?.id ?? "waiting"}`}
          login={login}
          onError={setError}
          onCancel={() =>
            void act(async () => {
              await api(`/connections/${login.id}`, "DELETE");
              setLogin(await api<Login>(`/connections/${login.id}`));
            })
          }
        />
      )}
    </main>
  );
}
