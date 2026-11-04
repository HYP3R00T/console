"use client";
import { ChevronRight, type Folder, Pin, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { ProjectContextMenu } from "@/components/projects/project-context-menu";
import { ProjectIcon } from "@/components/projects/project-icon";
import { ProjectRemovalDialog } from "@/components/projects/project-removal-dialog";
import {
  type Project,
  useMachineProjects,
} from "@/components/projects/projects-provider";
import { ProjectSessions } from "@/components/sessions/project-sessions";
import { sessionsChanged } from "@/components/sessions/use-project-sessions";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { orderPinnedProjects } from "@/lib/project-pins";
import { cn } from "@/lib/utils";
import { StandaloneNavigation } from "./standalone-navigation";

export function ProjectTree({
  deviceId,
  closeMobile = () => {},
  compact = false,
}: {
  deviceId: string;
  closeMobile?: () => void;
  compact?: boolean;
}) {
  const {
    projects,
    connected,
    error,
    pinnedIds,
    pinError,
    setPinned,
    request,
  } = useMachineProjects(deviceId);
  const [removing, setRemoving] = useState<Project>();
  const [actionError, setActionError] = useState<string>();
  const [creatingSession, setCreatingSession] = useState(false);
  const router = useRouter();
  const base = `/devices/${encodeURIComponent(deviceId)}`;
  const pathname = usePathname();
  function link(href: string, label: string, Icon: typeof Folder) {
    return (
      <SidebarAction
        key={href}
        compact={compact}
        nativeButton={false}
        render={<Link href={href} onClick={closeMobile} />}
        aria-label={label}
        title={compact ? label : undefined}
        aria-current={pathname === href ? "page" : undefined}
        className={cn(
          "navigation-row",
          pathname === href && "bg-sidebar-accent",
        )}
      >
        <Icon />
        {!compact && <span className="truncate">{label}</span>}
      </SidebarAction>
    );
  }
  const projectLinks =
    projects &&
    orderPinnedProjects(projects, pinnedIds).map((p) => {
      const href = `${base}/projects/${encodeURIComponent(p.id)}`;
      const pinned = pinnedIds.includes(p.id);
      const row = compact ? (
        <SidebarAction
          compact
          nativeButton={false}
          render={<Link href={href} onClick={closeMobile} />}
          aria-label={p.name}
          aria-description="Right-click or press Shift+F10 for project actions."
          title={`${p.name}${pinned ? " · pinned" : ""}`}
        >
          <ProjectIcon icon={p.icon} color={p.color} />
        </SidebarAction>
      ) : (
        <Collapsible className="group/project">
          <div
            className={cn(
              "flex items-center",
              pathname.startsWith(href) && "bg-sidebar-accent",
            )}
          >
            <CollapsibleTrigger
              aria-description="Right-click or press Shift+F10 for project actions."
              className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2 text-sm hover:bg-sidebar-accent [&[aria-expanded=true]>svg:first-child]:rotate-90"
            >
              <ChevronRight className="size-3 shrink-0 transition-transform" />
              <ProjectIcon icon={p.icon} color={p.color} />
              <span className="truncate">{p.name}</span>
              {pinned && (
                <Pin
                  className="ml-auto size-3 shrink-0 text-muted-foreground"
                  aria-label="Pinned project"
                />
              )}
              {!p.available && (
                <span
                  className="size-1.5 shrink-0 bg-destructive"
                  title="Directory unavailable"
                />
              )}
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="overflow-hidden">
            <ProjectSessions
              compact
              deviceId={deviceId}
              projectId={p.id}
              closeMobile={closeMobile}
            />
          </CollapsibleContent>
        </Collapsible>
      );
      return (
        <ProjectContextMenu
          key={p.id}
          name={p.name}
          href={href}
          pinned={pinned}
          onPin={() => {
            try {
              setPinned(p.id, !pinned);
              setActionError(undefined);
            } catch (cause) {
              setActionError(
                cause instanceof Error
                  ? cause.message
                  : "Could not save project pins.",
              );
            }
          }}
          onRemove={() => setRemoving(p)}
          onEdit={closeMobile}
          creatingSession={creatingSession || !connected || !p.available}
          onNewSession={() => {
            if (creatingSession) return;
            setCreatingSession(true);
            setActionError(undefined);
            void request<{ sessionId: string }>(
              `/v1/projects/${p.id}/sessions`,
              { method: "POST", body: "{}" },
            )
              .then(async (session) => {
                sessionsChanged();
                const data = await request<{ conversations: { id: number }[] }>(
                  `/v1/sessions/${session.sessionId}/conversations`,
                );
                closeMobile();
                router.push(
                  `${href}/sessions/${session.sessionId}/conversations/${data.conversations[0].id}`,
                );
              })
              .catch((cause) =>
                setActionError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not create session.",
                ),
              )
              .finally(() => setCreatingSession(false));
          }}
        >
          {row}
        </ProjectContextMenu>
      );
    });
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
  if (compact)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {link(`${base}/projects/new`, "Add project", Plus)}
        {projectLinks}
        {removal}
        {(actionError || pinError) && (
          <span role="alert" className="sr-only">
            {actionError ?? pinError}
          </span>
        )}
        <StandaloneNavigation
          deviceId={deviceId}
          compact
          closeMobile={closeMobile}
        />
      </div>
    );
  return (
    <div className="min-w-0 space-y-6 px-2">
      {removal}
      {(actionError || pinError) && (
        <p role="alert" className="px-3 text-xs text-destructive">
          {actionError ?? pinError}
        </p>
      )}
      <StandaloneNavigation deviceId={deviceId} closeMobile={closeMobile}>
        <section aria-label="Projects">
          <div className="mb-2 flex items-center justify-between pl-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Projects
            </h3>
            <Button
              nativeButton={false}
              variant="ghost"
              size="icon"
              aria-label="Add project"
              title="Add project"
              render={
                <Link href={`${base}/projects/new`} onClick={closeMobile} />
              }
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {projectLinks}
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
          ) : !projects.length ? (
            <p className="px-3 text-xs text-muted-foreground">
              No projects yet.
            </p>
          ) : null}
        </section>
      </StandaloneNavigation>
    </div>
  );
}
