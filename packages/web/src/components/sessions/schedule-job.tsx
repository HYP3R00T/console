"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { useBackendRequest } from "@/hooks/use-backend-request";

import { AgentProfilePicker } from "./agent-profile-picker";

export function ScheduleJob({
  path,
  request,
}: {
  path: string;
  request: ReturnType<typeof useBackendRequest>["request"];
}) {
  const id = useId();
  const [profileId, setProfileId] = useState<string>();
  const [content, setContent] = useState("");
  const [when, setWhen] = useState("");
  const [count, setCount] = useState("1");
  const [minutes, setMinutes] = useState("60");
  const [delivery, setDelivery] = useState("context");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const admission = useRef<{ signature: string; requestId: string }>(undefined);
  const at = when ? new Date(when).getTime() : undefined;
  const repeating = Number(count) > 1;
  const invalidCount =
    !/^\d+$/.test(count) || Number(count) < 1 || Number(count) > 1000;
  const invalidInterval =
    repeating &&
    (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 525600);
  const invalidTime = at !== undefined && !Number.isFinite(at);
  const invalid = invalidCount || invalidInterval || invalidTime;
  async function schedule() {
    if (saving || invalid || !content.trim()) return;
    const input = {
      content: content.trim(),
      profileId,
      at,
      delivery,
      ...(repeating && {
        recurrence: {
          occurrences: Number(count),
          intervalMs: Number(minutes) * 60000,
        },
      }),
    };
    const signature = JSON.stringify(input);
    if (admission.current?.signature !== signature)
      admission.current = { signature, requestId: crypto.randomUUID() };
    setSaving(true);
    setMessage(undefined);
    try {
      const job = await request<{ id: number }>(`${path}/jobs`, {
        method: "POST",
        body: JSON.stringify({
          ...input,
          requestId: admission.current.requestId,
        }),
      });
      admission.current = undefined;
      setContent("");
      setWhen("");
      setMessage({ text: `Background job #${job.id} scheduled.` });
    } catch (cause) {
      setMessage({
        error: true,
        text:
          cause instanceof Error
            ? cause.message
            : "Could not schedule the job.",
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Background job</CardTitle>
        <CardDescription>
          Run instructions in a separate worker using this chat’s configuration
          or a saved agent profile, with this chat’s post-run checks. Workers
          share the session token budget.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <AgentProfilePicker
            request={request}
            value={profileId}
            onChange={setProfileId}
            disabled={saving}
          />
          <Field>
            <FieldLabel htmlFor={`${id}-content`}>Job instructions</FieldLabel>
            <Textarea
              id={`${id}-content`}
              value={content}
              maxLength={32000}
              disabled={saving}
              onChange={(event) => setContent(event.target.value)}
              aria-describedby={`${id}-content-help`}
            />
            <FieldDescription id={`${id}-content-help`}>
              Provide a self-contained request: workers start with a fresh
              transcript. Selected tools can modify files. The workspace policy
              is captured when scheduled; changed settings stop the job.
              Sandboxed workers can write within their workspace.
            </FieldDescription>
          </Field>
          <Field data-invalid={invalidCount}>
            <FieldLabel htmlFor={`${id}-count`}>Total job runs</FieldLabel>
            <Input
              id={`${id}-count`}
              type="number"
              min={1}
              max={1000}
              step={1}
              value={count}
              disabled={saving}
              aria-invalid={invalidCount}
              onChange={(event) => setCount(event.target.value)}
            />
            <FieldDescription>
              1 runs once. 2–1000 includes the first run and later occurrences.
            </FieldDescription>
            {invalidCount && (
              <FieldError>Enter a whole number from 1 to 1000.</FieldError>
            )}
          </Field>
          {repeating && (
            <Field data-invalid={invalidInterval}>
              <FieldLabel htmlFor={`${id}-interval`}>
                Job interval in minutes
              </FieldLabel>
              <Input
                id={`${id}-interval`}
                type="number"
                min={1}
                max={525600}
                step={1}
                value={minutes}
                disabled={saving}
                aria-invalid={invalidInterval}
                onChange={(event) => setMinutes(event.target.value)}
              />
              <FieldDescription>
                Wait after each completed run. Occurrences never overlap or
                catch up missed intervals. A failed run or missing answer stops
                the schedule.
              </FieldDescription>
              {invalidInterval && (
                <FieldError>Enter a whole number from 1 to 525600.</FieldError>
              )}
            </Field>
          )}
          <Field data-invalid={invalidTime}>
            <FieldLabel htmlFor={`${id}-when`}>Job start time</FieldLabel>
            <Input
              id={`${id}-when`}
              type="datetime-local"
              value={when}
              disabled={saving}
              aria-invalid={invalidTime}
              onChange={(event) => setWhen(event.target.value)}
            />
            <FieldDescription>
              Uses your local time. Leave blank to start now.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel id={`${id}-delivery`}>Job result delivery</FieldLabel>
            <ToggleGroup
              className="max-w-full flex-wrap"
              variant="outline"
              size="sm"
              value={[delivery]}
              disabled={saving}
              aria-labelledby={`${id}-delivery`}
              onValueChange={(values) => {
                if (values[0]) setDelivery(String(values[0]));
              }}
            >
              <ToggleGroupItem value="display">Display</ToggleGroupItem>
              <ToggleGroupItem value="context">Context</ToggleGroupItem>
              <ToggleGroupItem value="followUp">Follow up</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {delivery === "display"
                ? "Show the result in Activity only."
                : delivery === "context"
                  ? "Include the result in the next model request without starting a run."
                  : "Start a parent response when the result arrives, or queue it after current work."}
            </FieldDescription>
          </Field>
        </FieldGroup>
        {message && (
          <p role={message.error ? "alert" : "status"}>{message.text}</p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          size="xs"
          disabled={saving || invalid || !content.trim()}
          onClick={() => void schedule()}
        >
          {saving
            ? "Scheduling…"
            : repeating
              ? "Schedule recurring job"
              : at === undefined
                ? "Start job"
                : "Schedule job"}
        </Button>
      </CardFooter>
    </Card>
  );
}
