"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useProviders } from "@/components/providers/providers-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginView } from "@/lib/providers";

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function ProviderLogin({
  initial,
  name,
  onDone,
}: {
  initial: LoginView;
  name: string;
  onDone: () => void;
}) {
  const { request, refresh } = useProviders();
  const [flow, setFlow] = useState(initial);
  const [answerInput, setAnswerInput] = useState({ id: "", value: "" });
  const value = answerInput.id === flow.prompt?.id ? answerInput.value : "";
  const setValue = (value: string) =>
    setAnswerInput({ id: flow.prompt?.id ?? "", value });
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [closed, setClosed] = useState(false);
  const path = `/v1/provider-logins/${encodeURIComponent(flow.id)}`;
  useEffect(() => {
    if (closed || flow.state !== "pending") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await request<LoginView>(path, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setFlow(next);
        if (next.state === "complete") void refresh();
        if (next.state !== "pending") return;
      } catch {
        if (controller.signal.aborted) return;
        setError("Could not check sign-in. Reconnect and try again.");
      }
      timer = setTimeout(() => void poll(), 600);
    }
    void poll();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [closed, flow.state, path, request, refresh]);
  async function answer(answerValue: string) {
    const prompt = flow.prompt;
    if (!prompt) return;
    setSending(true);
    setError(undefined);
    try {
      await request(`${path}/answer`, {
        method: "POST",
        body: JSON.stringify({ promptId: prompt.id, value: answerValue }),
      });
      setValue("");
      setFlow((previous) => ({ ...previous, prompt: undefined }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not submit this step.",
      );
    } finally {
      setSending(false);
    }
  }
  async function close() {
    setClosed(true);
    setValue("");
    onDone();
    if (flow.state === "pending")
      await request(path, { method: "DELETE" }).catch(() => {});
    await refresh();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void answer(value);
  }
  return (
    <Dialog
      open={!closed}
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {flow.state === "complete"
              ? "Credentials saved. No billable model request was made."
              : "Complete provider sign-in."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto">
          {flow.events.map((event) => (
            <div key={event.id} className="space-y-2 text-sm">
              {event.type === "auth_url" ? (
                <>
                  {event.instructions && <p>{event.instructions}</p>}
                  {safeUrl(event.url) && (
                    <Button
                      nativeButton={false}
                      variant="outline"
                      render={
                        <a
                          href={safeUrl(event.url)}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      Open sign-in page
                    </Button>
                  )}
                </>
              ) : event.type === "device_code" ? (
                <>
                  <p className="font-mono text-lg">{event.userCode}</p>
                  {safeUrl(event.verificationUri) && (
                    <Button
                      nativeButton={false}
                      variant="outline"
                      render={
                        <a
                          href={safeUrl(event.verificationUri)}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      Open sign-in page
                    </Button>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <p>{event.message}</p>
                  {event.type === "info" &&
                    event.links
                      ?.filter((link) => safeUrl(link.url))
                      .map((link) => (
                        <a
                          className="block underline"
                          key={link.url}
                          href={safeUrl(link.url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {link.label ?? "More information"}
                        </a>
                      ))}
                </div>
              )}
            </div>
          ))}
          {flow.prompt && (
            <form onSubmit={submit} className="space-y-3" key={flow.prompt.id}>
              <Label htmlFor="provider-login-answer">
                {flow.prompt.message}
              </Label>
              {flow.prompt.type === "select" ? (
                <div className="flex flex-col gap-2">
                  {flow.prompt.options?.map((option) => (
                    <Button
                      key={option.id}
                      variant="outline"
                      disabled={sending}
                      onClick={() => void answer(option.id)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <>
                  <Input
                    id="provider-login-answer"
                    type={flow.prompt.type === "secret" ? "password" : "text"}
                    autoComplete="off"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={flow.prompt.placeholder}
                    disabled={sending}
                  />
                  <Button type="submit" disabled={sending || !value.trim()}>
                    Continue
                  </Button>
                </>
              )}
            </form>
          )}
          {(error || flow.error) && (
            <p role="alert" className="text-sm text-destructive">
              {error ?? flow.error}
            </p>
          )}
          {flow.state === "pending" && !flow.prompt && (
            <p role="status" className="text-sm text-muted-foreground">
              Waiting for sign-in…
            </p>
          )}
          {flow.state === "cancelled" && (
            <p className="text-sm">Sign-in cancelled or expired.</p>
          )}
        </div>
        <Button variant="outline" onClick={() => void close()}>
          {flow.state === "pending" ? "Cancel" : "Done"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
