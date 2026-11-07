"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import { AgentProfilePicker } from "./agent-profile-picker";
import { ReviewTranscript } from "./review-transcript";

type Request = ReturnType<typeof useBackendRequest>["request"];
type Agent = {
  id: string;
  name: string;
  busy: boolean;
  queue: { id: number; content: string }[];
};

export function InspectorAgents({
  path,
  request,
  active,
}: {
  path: string;
  request: Request;
  active: boolean;
}) {
  const [agents, setAgents] = useState<Agent[]>();
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [profileId, setProfileId] = useState<string>();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef<{ name: string; id: string; profileId?: string }>(
    undefined,
  );
  const id = useId();
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await request<{ agents: Agent[] }>(`${path}/agents`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setAgents(next.agents);
          setError(undefined);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Could not load agents.",
          );
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void load(), 1500);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [active, path, request]);
  async function create() {
    if (saving || !name.trim()) return;
    if (
      pending.current?.name !== name.trim() ||
      pending.current?.profileId !== profileId
    )
      pending.current = {
        name: name.trim(),
        id: crypto.randomUUID(),
        profileId,
      };
    setSaving(true);
    setActionError(undefined);
    try {
      await request(`${path}/agents`, {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
      pending.current = undefined;
      setName("");
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Could not create agent.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Background agents</CardTitle>
        <CardDescription>
          Named agents keep their own conversation and inherit this chat’s
          configuration or a selected profile when created. Parent Stop leaves
          them running.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {(error || actionError) && (
          <p role="alert" className="text-destructive">
            {actionError ?? error}
          </p>
        )}
        {!agents && !error && <p role="status">Loading agents…</p>}
        {agents?.map((agent) => (
          <AgentControls
            key={agent.id}
            agent={agent}
            path={path}
            request={request}
            active={active}
          />
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <FieldGroup>
            <AgentProfilePicker
              request={request}
              value={profileId}
              onChange={setProfileId}
              disabled={saving}
            />
            <Field>
              <FieldLabel htmlFor={id}>New agent name</FieldLabel>
              <Input
                id={id}
                value={name}
                maxLength={100}
                disabled={saving}
                onChange={(event) => setName(event.target.value)}
              />
              <FieldDescription>
                Creating an agent does not start work. Send it a request below.
              </FieldDescription>
            </Field>
            <Button
              type="submit"
              variant="outline"
              disabled={saving || !name.trim() || (agents?.length ?? 0) >= 32}
            >
              {saving ? "Creating…" : "Create agent"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
function AgentControls({
  agent,
  path,
  request,
  active,
}: {
  agent: Agent;
  path: string;
  request: Request;
  active: boolean;
}) {
  const id = useId();
  const [content, setContent] = useState("");
  const [whenBusy, setWhenBusy] = useState("followUp");
  const [delivery, setDelivery] = useState("context");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<number>();
  const admission = useRef<{ signature: string; requestId: string }>(undefined);
  async function send() {
    if (pending || !content.trim()) return;
    const body = { content, whenBusy, delivery };
    const signature = JSON.stringify(body);
    if (admission.current?.signature !== signature)
      admission.current = { signature, requestId: crypto.randomUUID() };
    setPending(true);
    setError(undefined);
    setReceipt(undefined);
    try {
      const result = await request<{ id: number }>(
        `${path}/agents/${agent.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            ...body,
            requestId: admission.current.requestId,
          }),
        },
      );
      admission.current = undefined;
      setContent("");
      setReceipt(result.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not send the request.",
      );
    } finally {
      setPending(false);
    }
  }
  async function stop() {
    setPending(true);
    setError(undefined);
    try {
      await request(`${path}/agents/${agent.id}/stop`, {
        method: "POST",
        body: "{}",
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not stop the agent.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="break-words">{agent.name}</CardTitle>
        <CardDescription>
          {agent.busy ? "Working" : "Idle"} · {agent.queue.length} queued
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {receipt !== undefined && (
          <p role="status">
            Request accepted. Results will appear in Activity.
          </p>
        )}
        <ReviewTranscript
          agentId={agent.id}
          path={path}
          request={request}
          follow={active}
          active={active}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-message`}>
                Request for {agent.name}
              </FieldLabel>
              <Textarea
                id={`${id}-message`}
                value={content}
                maxLength={32000}
                disabled={pending}
                onChange={(event) => setContent(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel id={`${id}-queue`}>When busy</FieldLabel>
              <ToggleGroup
                aria-labelledby={`${id}-queue`}
                value={[whenBusy]}
                disabled={pending}
                onValueChange={(values) => {
                  if (values[0]) setWhenBusy(values[0]);
                }}
              >
                <ToggleGroupItem value="followUp">Queue next</ToggleGroupItem>
                <ToggleGroupItem value="steer">Steer</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                Steering joins at the next safe boundary.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel id={`${id}-delivery`}>Result delivery</FieldLabel>
              <ToggleGroup
                className="flex-wrap"
                aria-labelledby={`${id}-delivery`}
                value={[delivery]}
                disabled={pending}
                onValueChange={(values) => {
                  if (values[0]) setDelivery(values[0]);
                }}
              >
                <ToggleGroupItem value="display">Display</ToggleGroupItem>
                <ToggleGroupItem value="context">Context</ToggleGroupItem>
                <ToggleGroupItem value="followUp">Follow up</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                Context informs the parent’s next request. Follow up starts a
                parent response.
              </FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending || !content.trim()}>
                Send request
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending || (!agent.busy && !agent.queue.length)}
                onClick={() => void stop()}
              >
                Stop agent
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
