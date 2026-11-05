"use client";

import { Check } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConnections } from "@/components/connection-provider";
import { DeviceIcon } from "@/components/devices/device-icon";
import { useDevices } from "@/components/devices/device-provider";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ChatAttachment, wireAttachments } from "./attachments";
import { ChatComposer } from "./chat-composer";
import { DraftProjectPicker } from "./draft-project-picker";
import { draftStorageKey, moveDraft } from "./draft-storage";
import { type ModelRef, useChatModels } from "./use-chat-models";
import { type SessionRecord, sessionsChanged } from "./use-project-sessions";

type FirstMessage = {
  attachments?: ChatAttachment[];
  creationId: string;
  requestId: string;
  content: string;
  model: ModelRef;
  thinkingLevel?: string;
  sessionId?: string;
};
type Draft = {
  content: string;
  attachments?: ChatAttachment[];
  pending?: FirstMessage;
};

export function DraftConversationPage() {
  const params = useParams<{
    deviceId: string;
    projectId?: string;
    sessionId?: string;
  }>();
  const state = useMachineProjects(params.deviceId);
  if (!state.connected)
    return (
      <p className="text-sm text-muted-foreground">
        Connect this machine from Manage devices.
      </p>
    );
  const project = state.projects?.find((item) => item.id === params.projectId);
  if (params.projectId && !project)
    return (
      <p className="text-sm text-muted-foreground">
        {state.projects ? "Project not found." : "Loading project…"}
      </p>
    );
  return (
    <DraftChat
      key={`${state.origin}:${params.projectId}:${params.sessionId}`}
      {...params}
      projectName={project?.name}
    />
  );
}

function DraftChat({
  deviceId,
  projectId,
  sessionId,
  projectName,
}: {
  deviceId: string;
  projectId?: string;
  sessionId?: string;
  projectName?: string;
}) {
  const state = useMachineProjects(deviceId);
  const router = useRouter();
  const selectedProject = state.projects?.find(
    (project) => project.id === projectId,
  );
  const key = draftStorageKey(state.origin, projectId, sessionId);
  const { devices } = useDevices();
  const { states } = useConnections();
  const [draft, setDraft] = useState<Draft>({ content: "" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const lock = useRef(false);
  const active = useRef(true);
  const models = useChatModels(
    state.request,
    draft.pending?.model,
    draft.pending?.thinkingLevel,
  );
  useEffect(() => {
    active.current = true;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const value = JSON.parse(saved);
        if (typeof value.content === "string") setDraft(value);
      }
      setLoaded(true);
    } catch {
      setError("Could not restore this draft.");
    }
    return () => {
      active.current = false;
    };
  }, [key]);
  function save(value: Draft) {
    // Persist before sending so a reload or lost response keeps the retry identity.
    sessionStorage.setItem(key, JSON.stringify(value));
    setDraft(value);
  }
  function changeDestination(nextDeviceId: string, nextProjectId?: string) {
    if (busy || !loaded || draft.pending) return;
    const connection = states[nextDeviceId];
    if (connection?.status !== "connected" || !connection.origin) return;
    if (nextDeviceId === deviceId && nextProjectId === projectId) return;
    try {
      moveDraft(
        sessionStorage,
        key,
        draftStorageKey(connection.origin, nextProjectId),
        draft,
      );
      router.push(
        nextProjectId
          ? `/devices/${nextDeviceId}/projects/${nextProjectId}/conversations/new`
          : `/devices/${nextDeviceId}/conversations/new`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not move draft.",
      );
    }
  }
  async function send() {
    if (
      lock.current ||
      !loaded ||
      (!draft.pending &&
        ((!draft.content.trim() && !draft.attachments?.length) ||
          !models.model))
    )
      return;
    const selected = models.model;
    if (!draft.pending && !selected) return;
    const pending: FirstMessage = draft.pending ?? {
      content: draft.content.trim(),
      attachments: draft.attachments,
      creationId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      model: {
        provider: selected?.provider ?? "",
        modelId: selected?.id ?? "",
      },
      thinkingLevel: models.level,
      sessionId,
    };
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      save({
        content: pending.content,
        attachments: pending.attachments,
        pending,
      });
      let targetSession = pending.sessionId;
      let conversationId: number;
      if (projectId) {
        const data = await state.request<{ sessions: SessionRecord[] }>(
          `/v1/projects/${projectId}/sessions`,
        );
        targetSession ??= data.sessions.find(
          (item) => item.number === 1,
        )?.sessionId;
        if (
          !targetSession ||
          !data.sessions.some((item) => item.sessionId === targetSession)
        )
          throw new Error("Session is unavailable in this project.");
        pending.sessionId = targetSession;
        save({
          content: pending.content,
          attachments: pending.attachments,
          pending,
        });
        const created = await state.request<{ id: number }>(
          `/v1/sessions/${targetSession}/conversations`,
          {
            method: "POST",
            body: JSON.stringify({ creationId: pending.creationId }),
          },
        );
        conversationId = created.id;
      } else {
        const created = await state.request<SessionRecord>("/v1/standalone", {
          method: "POST",
          body: JSON.stringify({ creationId: pending.creationId }),
        });
        targetSession = created.sessionId;
        const detail = await state.request<{ conversationId: number }>(
          `/v1/standalone/${targetSession}`,
        );
        conversationId = detail.conversationId;
      }
      const { content, requestId, model, thinkingLevel } = pending;
      await state.request(
        `/v1/sessions/${targetSession}/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content,
            requestId,
            model,
            thinkingLevel,
            attachments: wireAttachments(pending.attachments ?? []),
          }),
        },
      );
      sessionStorage.removeItem(key);
      sessionsChanged();
      if (active.current)
        router.replace(
          projectId
            ? `/devices/${deviceId}/projects/${projectId}/sessions/${targetSession}/conversations/${conversationId}`
            : `/devices/${deviceId}/conversations/${targetSession}`,
        );
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not send. Retry safely.",
        );
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 items-center justify-center">
        <h1 className="text-xl font-medium">
          {projectName
            ? `What would you like to do in ${projectName}?`
            : "What would you like to work on?"}
        </h1>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {draft.pending && !busy && (
          <p role="status" className="text-xs text-muted-foreground">
            Delivery pending. Retry reuses this conversation and message.
          </p>
        )}
        <ChatComposer
          attachments={draft.pending?.attachments ?? draft.attachments ?? []}
          onAttachmentsChange={(attachments) => {
            try {
              save({ ...draft, attachments });
            } catch {
              setError(
                "Browser draft storage is full. Remove files or clear other drafts.",
              );
            }
          }}
          content={draft.pending?.content ?? draft.content}
          onChange={(content) => {
            try {
              save({ ...draft, content });
            } catch {
              setError("Could not save draft in this browser.");
            }
          }}
          onSend={() => void send()}
          sending={busy || !loaded}
          pending={!!draft.pending}
          working={false}
          models={models}
          context={
            <>
              <DraftProjectPicker
                project={selectedProject}
                projects={state.projects ?? []}
                disabled={busy || !loaded || !!draft.pending}
                onSelect={(id) => changeDestination(deviceId, id)}
              />
              <DropdownMenu>
                <ControlTooltip label="Change the machine for this chat">
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy || !loaded || !!draft.pending}
                        aria-label="Choose machine"
                        className="h-7 min-w-0 shrink gap-1.5 rounded-full px-2 text-xs"
                      />
                    }
                  >
                    {state.device && (
                      <DeviceIcon device={state.device} className="size-3.5" />
                    )}
                    <span className="truncate">
                      {state.device?.name ?? "Machine"}
                    </span>
                  </DropdownMenuTrigger>
                </ControlTooltip>
                <DropdownMenuContent side="top" align="start" className="w-64">
                  {devices.map((device) => (
                    <DropdownMenuItem
                      key={device.id}
                      disabled={states[device.id]?.status !== "connected"}
                      onClick={() =>
                        changeDestination(
                          device.id,
                          device.id === deviceId ? projectId : undefined,
                        )
                      }
                    >
                      <DeviceIcon device={device} className="size-3.5" />
                      <span className="truncate">{device.name}</span>
                      {device.id === deviceId ? (
                        <Check className="ml-auto size-3" />
                      ) : (
                        states[device.id]?.status !== "connected" && (
                          <span className="ml-auto text-muted-foreground">
                            Disconnected
                          </span>
                        )
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
      </div>
    </div>
  );
}
