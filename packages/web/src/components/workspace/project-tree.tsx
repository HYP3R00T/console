"use client";
import { type Folder, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { ProjectNavigation } from "@/components/projects/project-navigation";
import { ProjectRemovalDialog } from "@/components/projects/project-removal-dialog";
import {
  type Project,
  useMachineProjects,
} from "@/components/projects/projects-provider";
import { Button } from "@/components/ui/button";
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
  const { projects, connected, error, pinnedIds, pinError, setPinned } =
    useMachineProjects(deviceId);
  const [removing, setRemoving] = useState<Project>();
  const [actionError, setActionError] = useState<string>();
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
      const pinned = pinnedIds.includes(p.id);
      return (
        <ProjectNavigation
          key={`${deviceId}:${p.id}`}
          project={p}
          deviceId={deviceId}
          compact={compact}
          pinned={pinned}
          closeMobile={closeMobile}
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
        />
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
