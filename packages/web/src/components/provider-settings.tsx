"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  api,
  fieldClass,
  type Login,
  type Provider,
  safeLink,
} from "@/lib/api";
import { startPolling } from "@/lib/poll";

export function ProviderSettings() {
  const [provider, setProvider] = useState<Provider>();
  const [login, setLogin] = useState<Login | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(
    () =>
      startPolling({
        interval: 1000,
        read: async (signal) =>
          Promise.all([
            api<Provider>("/provider", "GET", undefined, signal),
            api<Login | null>("/provider/login", "GET", undefined, signal),
          ]),
        onValue: ([next, current]) => {
          setProvider(next);
          setLogin(current);
        },
        onError: (cause) => setError(cause.message),
      }),
    [],
  );
  async function act(path: string, method: string, body?: unknown) {
    setWorking(true);
    setError("");
    try {
      await api(path, method, body);
      setValue("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="space-y-5">
      <h1 className="text-xl font-semibold">Model access</h1>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p>{provider?.name ?? "Loading provider…"}</p>
      <p className="text-sm text-muted-foreground">
        {provider?.configured
          ? "Credentials configured. Successful inference still depends on account access."
          : "Connect your ChatGPT subscription to select a model."}
      </p>
      <div className="flex flex-wrap gap-2">
        {provider?.methods.map((method) => (
          <Button
            key={method.type}
            disabled={working || login?.status === "pending"}
            onClick={() =>
              void act("/provider/login", "POST", { method: method.type })
            }
          >
            {method.label}
          </Button>
        ))}
        {provider?.configured && (
          <Button
            variant="outline"
            disabled={working}
            onClick={() => void act("/provider/credentials", "DELETE")}
          >
            Remove saved credentials
          </Button>
        )}
      </div>
      {login && (
        <section className="space-y-3" aria-label="Provider login">
          <p role="status">Login: {login.status}</p>
          {login.events.map((event) => (
            <div key={event.id} className="space-y-2 text-sm">
              <p>{event.message ?? event.instructions}</p>
              {event.userCode && <code>{event.userCode}</code>}
              {safeLink(event.url ?? event.verificationUri) && (
                <a
                  className="block underline"
                  target="_blank"
                  rel="noreferrer"
                  href={safeLink(event.url ?? event.verificationUri)}
                >
                  Open provider authorization
                </a>
              )}
              {event.links?.map(
                (link) =>
                  safeLink(link.url) && (
                    <a
                      className="block underline"
                      key={link.url}
                      href={safeLink(link.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label ?? "Provider instructions"}
                    </a>
                  ),
              )}
            </div>
          ))}
          {login.prompt && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void act("/provider/login/answer", "POST", {
                  loginId: login.id,
                  promptId: login.prompt?.id,
                  value: value || login.prompt?.options?.[0]?.id || "",
                });
              }}
            >
              <label className="block space-y-2" htmlFor="provider-answer">
                <span>{login.prompt.message}</span>
                {login.prompt.type === "select" ? (
                  <select
                    id="provider-answer"
                    className={fieldClass}
                    value={value || login.prompt.options?.[0]?.id || ""}
                    onChange={(event) => setValue(event.target.value)}
                  >
                    {login.prompt.options?.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="provider-answer"
                    className={fieldClass}
                    type={login.prompt.type === "secret" ? "password" : "text"}
                    autoComplete="off"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                  />
                )}
              </label>
              <Button disabled={working}>Continue</Button>
            </form>
          )}
          {login.status === "pending" && (
            <Button
              variant="outline"
              disabled={working}
              onClick={() => void act("/provider/login", "DELETE")}
            >
              Cancel login
            </Button>
          )}
        </section>
      )}
    </section>
  );
}
