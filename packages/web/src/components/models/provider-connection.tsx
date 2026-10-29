"use client";

import { useState } from "react";
import { ChoiceSelect } from "@/components/shared/choice-select";
import { Button } from "@/components/ui/button";
import { api, fieldClass, type Login, safeLink } from "@/lib/api";

export function ProviderConnection({
  login,
  onCancel,
  onError,
}: {
  login: Login;
  onCancel: () => void;
  onError: (error: string) => void;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const prompt = login.prompt;
  return (
    <section
      className="space-y-4 rounded-none border p-5"
      aria-label="Provider connection"
    >
      <h2 className="font-medium">Connect {login.provider}</h2>
      <p role="status" className="text-sm text-muted-foreground">
        {login.status === "failed"
          ? "Connection failed. Try again and check the provider's instructions."
          : login.status}
      </p>
      {login.events.map((event) => (
        <div key={event.id} className="space-y-2 text-sm">
          {event.message && <p>{event.message}</p>}
          {event.instructions && <p>{event.instructions}</p>}
          {event.userCode && (
            <p>
              Device code:{" "}
              <code className="select-all font-semibold">{event.userCode}</code>
            </p>
          )}
          {safeLink(event.url ?? event.verificationUri) && (
            <a
              className="underline"
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
      {prompt && (
        <form
          key={prompt.id}
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setSending(true);
            try {
              await api(`/connections/${login.id}/answer`, "POST", {
                promptId: prompt.id,
                value: value || prompt.options?.[0]?.id || "",
              });
              setValue("");
            } catch (error) {
              onError((error as Error).message);
            } finally {
              setSending(false);
            }
          }}
        >
          <label className="block space-y-2" htmlFor={prompt.id}>
            <span className="text-sm">{prompt.message}</span>
            {prompt.type === "select" ? (
              <ChoiceSelect
                label={prompt.message}
                value={value || prompt.options?.[0]?.id || ""}
                items={(prompt.options ?? []).map((option) => ({
                  value: option.id,
                  label: option.label,
                }))}
                onChange={setValue}
              />
            ) : (
              <input
                id={prompt.id}
                autoComplete="off"
                className={fieldClass}
                type={prompt.type === "secret" ? "password" : "text"}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </label>
          <Button disabled={sending} type="submit">
            Continue
          </Button>
        </form>
      )}
      {login.status === "pending" && (
        <Button variant="outline" onClick={onCancel}>
          Cancel connection
        </Button>
      )}
    </section>
  );
}
