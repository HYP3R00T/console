"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { useDevices } from "@/components/devices/device-provider";
import type { Project } from "@/components/projects/projects-provider";
import type {
  Conversation,
  Session,
  SessionRecord,
} from "@/components/sessions/use-project-sessions";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BackendClient } from "@/lib/backend/client";
import {
  clientPreferencePages,
  conversationSettingsHref,
  machinePreferencePages,
  type PreferenceTarget,
  preferencesHref,
  preferenceTarget,
} from "@/lib/preferences-navigation";

function Choice({
  id,
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value?: string;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value ?? null}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder}>
            {options.find((option) => option.value === value)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
function Destination({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={<Link href={href} />}
    >
      {children}
    </Button>
  );
}

export function PreferencesHub() {
  const search = useSearchParams(),
    router = useRouter(),
    registry = useDevices();
  const target = preferenceTarget({}, search);
  const device = registry.devices.find((item) => item.id === target.deviceId);
  const { client, status } = useConnection(device?.id ?? "");
  const [data, setData] = useState<{
    client: BackendClient;
    projectId?: string;
    projects: Project[];
    sessions: SessionRecord[];
  }>();
  const [detail, setDetail] = useState<{
    client: BackendClient;
    sessionId: string;
    conversations: Conversation[];
  }>();
  const [error, setError] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const projectId = target.projectId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh retries discovery for the selected machine and project.
  useEffect(() => {
    setError(undefined);
    if (!client) return;
    const connectedClient = client;
    const controller = new AbortController();
    async function load() {
      try {
        const [projects, records] = await Promise.all([
          connectedClient.request<{ projects: Project[] }>("/v1/projects", {
            signal: controller.signal,
          }),
          projectId
            ? connectedClient.request<{ sessions: SessionRecord[] }>(
                `/v1/projects/${encodeURIComponent(projectId)}/sessions`,
                { signal: controller.signal },
              )
            : connectedClient.request<{ sessions: SessionRecord[] }>(
                "/v1/standalone",
                { signal: controller.signal },
              ),
        ]);
        if (!controller.signal.aborted)
          setData({
            client: connectedClient,
            projectId,
            projects: projects.projects,
            sessions: [
              ...new Map(
                records.sessions.map((session) => [session.sessionId, session]),
              ).values(),
            ],
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load preference targets.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [client, projectId, refresh]);
  const selectedSessionId = target.sessionId,
    selectedConversationId = target.conversationId,
    selectedDeviceId = target.deviceId;
  useEffect(() => {
    if (!client || !selectedSessionId || projectId) return;
    const controller = new AbortController();
    void client
      .request<Session>(
        `/v1/sessions/${encodeURIComponent(selectedSessionId)}/conversations`,
        { signal: controller.signal },
      )
      .then((result) => {
        if (!controller.signal.aborted && result.session.projectId)
          router.replace(
            preferencesHref({
              deviceId: selectedDeviceId,
              projectId: result.session.projectId,
              sessionId: selectedSessionId,
              conversationId: selectedConversationId,
            }),
            { scroll: false },
          );
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Could not locate the selected session.",
          );
      });
    return () => controller.abort();
  }, [
    client,
    projectId,
    selectedSessionId,
    selectedConversationId,
    selectedDeviceId,
    router,
  ]);
  const current =
    data && data.client === client && data.projectId === projectId
      ? data
      : undefined;
  const sessions = current?.sessions.filter(
    (session) => (session.projectId || undefined) === projectId,
  );
  const session = sessions?.find((item) => item.sessionId === target.sessionId);
  useEffect(() => {
    if (!client || !session) return;
    const controller = new AbortController();
    void client
      .request<Session>(
        `/v1/sessions/${encodeURIComponent(session.sessionId)}/conversations`,
        { signal: controller.signal },
      )
      .then((result) => {
        if (!controller.signal.aborted)
          setDetail({
            client,
            sessionId: session.sessionId,
            conversations: result.conversations,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load conversations.",
          );
      });
    return () => controller.abort();
  }, [client, session]);
  const conversations =
    detail &&
    detail.client === client &&
    detail.sessionId === session?.sessionId
      ? detail.conversations
      : undefined;
  const conversation = conversations?.find(
    (item) => String(item.id) === target.conversationId,
  );
  function select(next: PreferenceTarget) {
    router.replace(preferencesHref(next), { scroll: false });
  }
  const machine = device && `/devices/${encodeURIComponent(device.id)}`;
  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Preferences</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One place for your configuration. Choose whose settings to edit; each
          value stays with its owner.
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
            <CardDescription>
              Only this browser. Shared across the machines you view.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {clientPreferencePages.map((page) => (
              <Destination
                key={page.path}
                href={preferencesHref(target, page.path)}
              >
                {page.label}
              </Destination>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Machine</CardTitle>
            <CardDescription>
              Shared by every client connected to the selected backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Choice
              id="preferences-machine"
              label="Machine"
              value={device?.id}
              placeholder="Choose a saved machine"
              options={registry.devices.map((device) => ({
                value: device.id,
                label: device.name,
              }))}
              onChange={(deviceId) => select({ deviceId })}
            />
            {device && (
              <p role="status" className="text-xs text-muted-foreground">
                {status === "connected"
                  ? "Connected. Selecting settings does not change the connection."
                  : status === "connecting"
                    ? "Connecting to this machine…"
                    : "Not connected. Connect through Manage devices to edit backend settings."}
              </p>
            )}
            {!registry.devices.length && registry.ready && (
              <p className="text-sm text-muted-foreground">
                Add a machine in <Link href="/devices">Manage devices</Link>.
              </p>
            )}
            {machine && (
              <div className="flex flex-wrap gap-2">
                {machinePreferencePages.map((page) => (
                  <Destination
                    key={page.id}
                    href={preferencesHref(
                      target,
                      `${machine}/settings/${page.id}`,
                    )}
                  >
                    {page.label}
                  </Destination>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Project, session and conversation</CardTitle>
          <CardDescription>
            Choose a workspace below. Project guidance is shared; session
            policies govern siblings; conversation settings apply to one agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <Choice
              id="preferences-project"
              label="Project"
              value={projectId ?? "standalone"}
              placeholder="Choose a project"
              disabled={!current || !client}
              options={[
                { value: "standalone", label: "Standalone sessions" },
                ...(current?.projects ?? []).map((project) => ({
                  value: project.id,
                  label: project.name,
                })),
              ]}
              onChange={(value) =>
                select({
                  deviceId: device?.id,
                  projectId: value === "standalone" ? undefined : value,
                })
              }
            />
            <Choice
              id="preferences-session"
              label="Session"
              value={session?.sessionId}
              placeholder={
                !client
                  ? "Connect a machine first"
                  : !current
                    ? "Loading sessions…"
                    : sessions?.length
                      ? "Choose a session"
                      : "No sessions available"
              }
              disabled={!client || !sessions?.length}
              options={(sessions ?? []).map((session) => ({
                value: session.sessionId,
                label: session.name,
              }))}
              onChange={(sessionId) =>
                select({ ...target, sessionId, conversationId: undefined })
              }
            />
            <Choice
              id="preferences-conversation"
              label="Conversation"
              value={conversation ? String(conversation.id) : undefined}
              placeholder={
                !client
                  ? "Connect a machine first"
                  : !session
                    ? "Choose a session first"
                    : !conversations
                      ? "Loading conversations…"
                      : conversations.length
                        ? "Choose a conversation"
                        : "No conversations available"
              }
              disabled={!client || !conversations?.length}
              options={(conversations ?? []).map((conversation) => ({
                value: String(conversation.id),
                label: conversation.name,
              }))}
              onChange={(conversationId) =>
                select({ ...target, conversationId })
              }
            />
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            {machine &&
              current?.projects.some((project) => project.id === projectId) && (
                <Destination
                  href={preferencesHref(
                    target,
                    `${machine}/projects/${encodeURIComponent(projectId ?? "")}/settings`,
                  )}
                >
                  Project settings
                </Destination>
              )}
            {machine && session && (
              <Destination
                href={preferencesHref(
                  target,
                  `${machine}/sessions/${encodeURIComponent(session.sessionId)}/settings`,
                )}
              >
                Session runtime settings
              </Destination>
            )}
            {device && session && conversation && (
              <Destination
                href={preferencesHref(
                  target,
                  conversationSettingsHref(
                    device.id,
                    session.sessionId,
                    conversation.id,
                  ),
                )}
              >
                Conversation settings
              </Destination>
            )}
          </div>
          {(target.projectId || target.sessionId || target.conversationId) && (
            <Button
              variant="ghost"
              className="self-start"
              onClick={() => select({ deviceId: device?.id })}
            >
              Clear workspace selection
            </Button>
          )}
          {!device && (
            <p className="text-sm text-muted-foreground">
              Select a machine above to browse its workspaces.
            </p>
          )}
          {client && !current && !error && (
            <p role="status">Loading projects and sessions…</p>
          )}
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 text-sm text-destructive"
            >
              {error}
              <Button
                variant="outline"
                onClick={() => setRefresh((value) => value + 1)}
              >
                Retry
              </Button>
            </div>
          )}
          <FieldDescription>
            These selectors only navigate configuration. They do not create
            conversations, connect machines, or start work.
          </FieldDescription>
        </CardContent>
      </Card>
    </div>
  );
}
