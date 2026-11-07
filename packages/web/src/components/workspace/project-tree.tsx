"use client";
import { Plus, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { NavigationDragProvider } from "@/components/layout/navigation-drag";
import { useNavigationDisclosure } from "@/components/layout/navigation-memory";
import { NavigationSection } from "@/components/layout/navigation-section";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { ProjectNavigation } from "@/components/projects/project-navigation";
import { ProjectRemovalDialog } from "@/components/projects/project-removal-dialog";
import {
  type Project,
  useMachineProjects,
} from "@/components/projects/projects-provider";
import { useConversationPins } from "@/components/sessions/conversation-preferences";
import { ConversationRow } from "@/components/sessions/conversation-row";
import { Button } from "@/components/ui/button";
import { standaloneConversationPath } from "@/lib/conversation-path";
import { conversationKey } from "@/lib/conversation-pins";
import { splitPinnedItems } from "@/lib/navigation-sections";
import { usePinnedConversations } from "./use-pinned-conversations";
import { useStandaloneNavigation } from "./use-standalone-navigation";

export function ProjectTree(props: {
  deviceId: string;
  closeMobile?: () => void;
  compact?: boolean;
}) {
  return (
    <NavigationDragProvider key={props.deviceId} deviceId={props.deviceId}>
      <ProjectTreeContent {...props} />
    </NavigationDragProvider>
  );
}
function ProjectTreeContent({
  deviceId,
  closeMobile = () => {},
  compact = false,
}: {
  deviceId: string;
  closeMobile?: () => void;
  compact?: boolean;
}) {
  const { projects, connected, error, pinnedIds, pinError, setPinned } =
    useMachineProjects(deviceId);
  const standalone = useStandaloneNavigation(deviceId, closeMobile);
  const preferences = useConversationPins();
  const pinnedConversations = usePinnedConversations(
    deviceId,
    preferences.pins,
  );
  const [removing, setRemoving] = useState<Project>();
  const [actionError, setActionError] = useState<string>();
  const [recentsOpen, setRecentsOpen] = useNavigationDisclosure(
    `${deviceId}:section:recents`,
    true,
  );
  const router = useRouter();
  const base = `/devices/${encodeURIComponent(deviceId)}`;
  const pathname = usePathname();
  const projectGroups = splitPinnedItems(
    projects ?? [],
    (p) => p.id,
    pinnedIds,
  );
  const conversationGroups = splitPinnedItems(
    standalone.sessions ?? [],
    (s) => conversationKey(s.sessionId, s.conversationId),
    preferences.pins,
  );

  function projectRow(project: Project) {
    const pinned = pinnedIds.includes(project.id);
    return (
      <ProjectNavigation
        key={`${deviceId}:${project.id}`}
        project={project}
        deviceId={deviceId}
        compact={compact}
        pinned={pinned}
        closeMobile={closeMobile}
        onPin={() => {
          try {
            setPinned(project.id, !pinned);
            setActionError(undefined);
          } catch (cause) {
            setActionError(
              cause instanceof Error
                ? cause.message
                : "Could not save project pins.",
            );
          }
        }}
        onRemove={() => setRemoving(project)}
      />
    );
  }
  function conversationRow(
    session: NonNullable<typeof standalone.sessions>[number],
  ) {
    return (
      <ConversationRow
        key={`${session.sessionId}:${session.conversationId}`}
        sessionId={session.sessionId}
        conversation={{ id: session.conversationId, name: session.name }}
        href={standaloneConversationPath(
          standalone.base,
          session.sessionId,
          session.conversationId,
        )}
        compact={compact}
        closeMobile={closeMobile}
      />
    );
  }
  const pinnedRows = (
    <>
      {projectGroups.pinned.map(projectRow)}
      {pinnedConversations.map(({ key, session, conversation, loading }) =>
        session && conversation ? (
          <ConversationRow
            key={key}
            sessionId={session.sessionId}
            projectId={session.projectId || undefined}
            conversation={conversation}
            href={
              session.projectId
                ? `${base}/projects/${session.projectId}/sessions/${session.sessionId}/conversations/${conversation.id}`
                : standaloneConversationPath(
                    standalone.base,
                    session.sessionId,
                    conversation.id,
                  )
            }
            compact={compact}
            closeMobile={closeMobile}
          />
        ) : (
          <div
            key={key}
            className="flex items-center px-2 text-xs text-muted-foreground"
          >
            <span className="flex-1">
              {loading ? "Loading pinned chat…" : "Unavailable pinned chat"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                try {
                  preferences.setPin(key, false);
                } catch (cause) {
                  setActionError(
                    cause instanceof Error ? cause.message : "Could not unpin.",
                  );
                }
              }}
            >
              Unpin
            </Button>
          </div>
        ),
      )}
    </>
  );
  const removal = removing && (
    <ProjectRemovalDialog
      key={removing.id}
      project={removing}
      deviceId={deviceId}
      onClose={() => setRemoving(undefined)}
      onRemoved={(id) => {
        const href = `${base}/projects/${encodeURIComponent(id)}`;
        if (pathname === href || pathname.startsWith(`${href}/`)) {
          router.push(base);
          closeMobile();
        }
      }}
    />
  );
  const message =
    actionError ?? pinError ?? preferences.error ?? standalone.error;
  if (compact)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <SidebarAction
          compact
          nativeButton={false}
          aria-label="Add project"
          title="Add project"
          render={<Link href={`${base}/projects/new`} onClick={closeMobile} />}
        >
          <Plus />
        </SidebarAction>
        {pinnedRows}
        {projectGroups.regular.map(projectRow)}
        {conversationGroups.regular.map(conversationRow)}
        {removal}
        {message && (
          <span role="alert" className="sr-only">
            {message}
          </span>
        )}
      </div>
    );
  return (
    <div className="min-w-0 space-y-6 px-2">
      {removal}
      <SidebarAction
        nativeButton={false}
        className="h-7 gap-2 px-2 [&_svg]:size-3"
        render={<Link href={`${standalone.base}/new`} onClick={closeMobile} />}
      >
        <SquarePen />
        <span>New conversation</span>
      </SidebarAction>
      {message && (
        <p role="alert" className="px-3 text-xs text-destructive">
          {message}
        </p>
      )}
      <NavigationSection
        label="Pinned"
        memoryKey={`${deviceId}:section:pinned`}
        dropTarget="pinned"
      >
        {pinnedRows}
        {!projectGroups.pinned.length && !preferences.pins.length && (
          <p className="px-3 text-xs text-muted-foreground">No pinned items.</p>
        )}
      </NavigationSection>
      <NavigationSection
        label="Projects"
        memoryKey={`${deviceId}:section:projects`}
        dropTarget="projects"
        actions={[
          {
            id: "add-project",
            label: "Add project",
            icon: Plus,
            primary: true,
            onSelect: () => {
              router.push(`${base}/projects/new`);
              closeMobile();
            },
          },
        ]}
      >
        {projectGroups.regular.map(projectRow)}
        {!connected ? (
          <p className="px-3 text-xs text-muted-foreground">
            Connect this machine to see projects.
          </p>
        ) : error ? (
          <p role="alert" className="px-3 text-xs text-destructive">
            {error}
          </p>
        ) : !projects ? (
          <p className="px-3 text-xs text-muted-foreground">
            Loading projects…
          </p>
        ) : !projectGroups.regular.length ? (
          <p className="px-3 text-xs text-muted-foreground">
            {projects.length ? "All projects are pinned." : "No projects yet."}
          </p>
        ) : null}
      </NavigationSection>
      <NavigationSection
        label="Recents"
        memoryKey={`${deviceId}:section:recents`}
        open={recentsOpen}
        onOpenChange={setRecentsOpen}
        dropTarget="recents"
        actions={[
          {
            id: "create-conversation",
            label: "New conversation",
            shortcutLabel: "New conversation in Recents",
            icon: SquarePen,
            primary: true,
            disabled: !connected || standalone.creating,
            onSelect: () => {
              setRecentsOpen(true);
              void standalone.create();
            },
          },
        ]}
      >
        {conversationGroups.regular.map(conversationRow)}
        {!standalone.error && !conversationGroups.regular.length && (
          <p className="px-3 text-xs text-muted-foreground">
            {!connected
              ? "Connect this machine to see Recents."
              : !standalone.sessions
                ? "Loading conversations…"
                : "No recent conversations found."}
          </p>
        )}
      </NavigationSection>
    </div>
  );
}
