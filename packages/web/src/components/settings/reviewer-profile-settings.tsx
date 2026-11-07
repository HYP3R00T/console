"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBackendRequest } from "@/hooks/use-backend-request";
import { modelKey } from "../sessions/use-chat-models";
import {
  type ReviewerProfile,
  useReviewerProfiles,
} from "../sessions/use-reviewer-profiles";

type Edit = { revision: number; profiles: ReviewerProfile[] };
export function ReviewerProfileSettings({
  kind = "reviewer",
}: {
  kind?: "reviewer" | "agent";
}) {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { client, request } = useBackendRequest();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">
          {kind === "agent" ? "Agent profiles" : "Reviewer profiles"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {kind === "agent"
            ? "Reusable model, instructions and tool choices for background agents and jobs."
            : "Reusable read-only review roles on this machine."}{" "}
          Scheduled work keeps the settings captured when it was created.
        </p>
      </header>
      {client ? (
        <ProfilesForm
          key={`${deviceId}-${kind}`}
          request={request}
          kind={kind}
        />
      ) : (
        <p>Connect this machine from Manage devices.</p>
      )}
    </div>
  );
}
function ProfilesForm({
  request,
  kind,
}: {
  request: ReturnType<typeof useBackendRequest>["request"];
  kind: "reviewer" | "agent";
}) {
  const {
    snapshot,
    setSnapshot,
    error: loadError,
  } = useReviewerProfiles(request, kind);
  const [edit, setEdit] = useState<Edit>();
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  if (!snapshot)
    return (
      <p role={loadError ? "alert" : "status"}>
        {loadError ?? `Loading ${kind} profiles…`}
      </p>
    );
  const revision = snapshot.revision;
  const profiles = edit?.profiles ?? snapshot.profiles;
  const profile =
    profiles.find((item) => item.id === selectedId) ?? profiles[0];
  const selectedModel = snapshot.models.find(
    (model) =>
      model.provider === profile?.model.provider &&
      model.id === profile?.model.modelId,
  );
  const stale = !!edit && edit.revision !== snapshot.revision;
  const names = profiles.map((item) => item.name.trim().toLowerCase());
  const invalid =
    new Set(names).size !== names.length ||
    profiles.some((item) => {
      const model = snapshot.models.find(
        (model) =>
          model.provider === item.model.provider &&
          model.id === item.model.modelId,
      );
      return (
        (kind === "agent" &&
          (() => {
            const tools = (item.tools ?? [])
              .map((name) => name.trim())
              .filter(Boolean);
            return (
              tools.length > 200 ||
              new Set(tools).size !== tools.length ||
              tools.some((name) => name.length > 200)
            );
          })()) ||
        !item.name.trim() ||
        !model ||
        !Number.isInteger(item.maxTurns) ||
        item.maxTurns < 1 ||
        item.maxTurns > 50 ||
        !Number.isInteger(item.passes ?? 1) ||
        (item.passes ?? 1) < 1 ||
        (item.passes ?? 1) > 5 ||
        (item.thinkingLevel !== null &&
          !model.thinkingLevels.includes(item.thinkingLevel))
      );
    });
  function change(next: ReviewerProfile[]) {
    setEdit({ revision: edit?.revision ?? revision, profiles: next });
    setMessage(undefined);
  }
  function update(patch: Partial<ReviewerProfile>) {
    if (profile)
      change(
        profiles.map((item) =>
          item.id === profile.id ? { ...item, ...patch } : item,
        ),
      );
  }
  async function save() {
    if (!edit || stale || invalid || busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const next = await request<Edit>(`/v1/machine/${kind}-profiles`, {
        method: "PUT",
        body: JSON.stringify({
          ...edit,
          profiles: edit.profiles.map((item) =>
            kind === "agent"
              ? {
                  ...item,
                  tools: (item.tools ?? [])
                    .map((name) => name.trim())
                    .filter(Boolean),
                }
              : item,
          ),
        }),
      });
      setSnapshot((current) =>
        current && next.revision >= current.revision
          ? { ...current, ...next }
          : current,
      );
      setEdit(undefined);
      setMessage({ text: "Profiles saved." });
    } catch (cause) {
      setMessage({
        text:
          cause instanceof Error ? cause.message : "Could not save profiles.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || profiles.length >= 100 || !snapshot.models.length}
          onClick={() => {
            const model = snapshot.models[0];
            const id = crypto.randomUUID();
            const next: ReviewerProfile = {
              id,
              name: "",
              model: { provider: model.provider, modelId: model.id },
              thinkingLevel: null,
              maxTurns: 6,
              ...(kind === "reviewer" ? { passes: 1 } : { tools: ["read"] }),
              instructions: "",
            };
            change([...profiles, next]);
            setSelectedId(id);
          }}
        >
          Add profile
        </Button>
        {profile && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              change(profiles.filter((item) => item.id !== profile.id));
              setSelectedId(undefined);
            }}
          >
            Remove profile
          </Button>
        )}
      </div>
      {!profiles.length && (
        <p>No profiles. Add one to reuse a role across conversations.</p>
      )}
      {profile && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reviewer-profile">Profile</FieldLabel>
            <Select
              value={profile.id}
              disabled={busy}
              onValueChange={(id) => {
                if (id) setSelectedId(id);
              }}
            >
              <SelectTrigger id="reviewer-profile">
                <SelectValue>{profile.name || "Unnamed profile"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {profiles.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name || "Unnamed profile"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!profile.name.trim()}>
            <FieldLabel htmlFor="reviewer-name">Profile name</FieldLabel>
            <Input
              id="reviewer-name"
              value={profile.name}
              disabled={busy}
              maxLength={100}
              aria-invalid={!profile.name.trim()}
              onChange={(event) => update({ name: event.target.value })}
            />
          </Field>
          <Field data-invalid={!selectedModel}>
            <FieldLabel htmlFor="reviewer-model">Model</FieldLabel>
            <Select
              value={modelKey({
                provider: profile.model.provider,
                id: profile.model.modelId,
              })}
              disabled={busy}
              onValueChange={(key) => {
                const model = snapshot.models.find(
                  (model) => modelKey(model) === key,
                );
                if (model)
                  update({
                    model: { provider: model.provider, modelId: model.id },
                    thinkingLevel: null,
                  });
              }}
            >
              <SelectTrigger id="reviewer-model" aria-invalid={!selectedModel}>
                <SelectValue>
                  {selectedModel
                    ? `${selectedModel.name} (${selectedModel.provider})`
                    : `${profile.model.modelId} (unavailable)`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {snapshot.models.map((model) => (
                    <SelectItem key={modelKey(model)} value={modelKey(model)}>
                      {model.name} ({model.provider})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {!!selectedModel?.thinkingLevels.length && (
            <Field>
              <FieldLabel htmlFor="reviewer-thinking">
                Thinking level
              </FieldLabel>
              <Select
                value={profile.thinkingLevel ?? "default"}
                disabled={busy}
                onValueChange={(level) => {
                  if (level)
                    update({
                      thinkingLevel: level === "default" ? null : level,
                    });
                }}
              >
                <SelectTrigger id="reviewer-thinking">
                  <SelectValue>
                    {profile.thinkingLevel ?? "Model default"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="default">Model default</SelectItem>
                    {selectedModel.thinkingLevels.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field
            data-invalid={
              !Number.isInteger(profile.maxTurns) ||
              profile.maxTurns < 1 ||
              profile.maxTurns > 50
            }
          >
            <FieldLabel htmlFor="reviewer-turns">Turn limit</FieldLabel>
            <Input
              id="reviewer-turns"
              type="number"
              min={1}
              max={50}
              step={1}
              value={profile.maxTurns || ""}
              disabled={busy}
              aria-invalid={
                !Number.isInteger(profile.maxTurns) ||
                profile.maxTurns < 1 ||
                profile.maxTurns > 50
              }
              onChange={(event) =>
                update({ maxTurns: Number(event.target.value) })
              }
            />
          </Field>
          {kind === "reviewer" && (
            <Field
              data-invalid={
                !Number.isInteger(profile.passes ?? 1) ||
                (profile.passes ?? 1) < 1 ||
                (profile.passes ?? 1) > 5
              }
            >
              <FieldLabel htmlFor="reviewer-passes">Review passes</FieldLabel>
              <Input
                id="reviewer-passes"
                type="number"
                min={1}
                max={5}
                step={1}
                value={profile.passes ?? 1}
                disabled={busy}
                aria-invalid={
                  !Number.isInteger(profile.passes ?? 1) ||
                  (profile.passes ?? 1) < 1 ||
                  (profile.passes ?? 1) > 5
                }
                onChange={(event) =>
                  update({ passes: Number(event.target.value) })
                }
              />
              <FieldDescription>
                1–5 passes. The turn limit applies to each pass; all passes
                share the session token budget. Only the final report is
                delivered.
              </FieldDescription>
            </Field>
          )}
          {kind === "agent" && (
            <Field>
              <FieldLabel htmlFor="agent-tools">Enabled tools</FieldLabel>
              <Textarea
                id="agent-tools"
                value={(profile.tools ?? []).join("\n")}
                disabled={busy}
                onChange={(event) =>
                  update({ tools: event.target.value.split("\n") })
                }
              />
              <FieldDescription>
                One tool name per line, such as read, write, edit or bash. Leave
                empty for no tools. Each tool must also be enabled in the parent
                chat when the profile is used.
              </FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="reviewer-instructions">
              Instructions
            </FieldLabel>
            <Textarea
              id="reviewer-instructions"
              value={profile.instructions}
              disabled={busy}
              maxLength={16000}
              onChange={(event) => update({ instructions: event.target.value })}
            />
            <FieldDescription>
              {kind === "reviewer"
                ? "Describe the review focus. Profiles retain workspace-scoped read tools."
                : "Describe the agent’s role and constraints."}
            </FieldDescription>
          </Field>
        </FieldGroup>
      )}
      {invalid && (
        <p role="alert">
          Each profile needs a unique name, an available model, supported
          thinking and a whole-number turn limit from 1 to 50.{" "}
          {kind === "reviewer"
            ? "Use 1–5 review passes."
            : "Use unique tool names, at most 200 names of 200 characters each."}
        </p>
      )}
      {stale && (
        <p role="alert">
          Profiles changed elsewhere. Discard edits to load the latest version.
        </p>
      )}
      {loadError && <p role="alert">{loadError}</p>}
      {message && (
        <p role={message.error ? "alert" : "status"}>{message.text}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!edit || busy || stale || invalid || !!loadError}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save profiles"}
        </Button>
        {edit && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setEdit(undefined);
              setMessage(undefined);
            }}
          >
            Discard edits
          </Button>
        )}
      </div>
    </div>
  );
}
