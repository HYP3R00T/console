"use client";
import { Layers, Pencil, Pin, PinOff, SquarePen, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { NavigationMenu } from "@/components/layout/navigation-menu";
import { NavigationRow } from "@/components/layout/navigation-row";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { ProjectSessions } from "@/components/sessions/project-sessions";
import { useProjectNavigation } from "@/components/sessions/use-project-navigation";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ProjectIcon } from "./project-icon";
import type { Project } from "./projects-provider";

export function ProjectNavigation({
  project,
  deviceId,
  compact,
  pinned,
  onPin,
  onRemove,
  closeMobile,
}: {
  project: Project;
  deviceId: string;
  compact: boolean;
  pinned: boolean;
  onPin: () => void;
  onRemove: () => void;
  closeMobile: () => void;
}) {
  const href = `/devices/${encodeURIComponent(deviceId)}/projects/${encodeURIComponent(project.id)}`;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(pathname.startsWith(`${href}/sessions/`));
  const { state, create, busy, error } = useProjectNavigation(
    deviceId,
    project.id,
    project.available,
    open && !compact,
    () => {
      setOpen(true);
      closeMobile();
    },
  );
  const disabled = busy || !state.connected || !project.available;
  const actions = [
    {
      label: "New conversation",
      icon: SquarePen,
      disabled,
      onSelect: () => void create("conversation"),
    },
    {
      label: "New session",
      icon: Layers,
      disabled,
      onSelect: () => void create("session"),
    },
    {
      label: pinned ? "Unpin" : "Pin to top",
      icon: pinned ? PinOff : Pin,
      separator: true,
      onSelect: onPin,
    },
    {
      label: "Edit project",
      icon: Pencil,
      onSelect: () => {
        router.push(`${href}/settings`);
        closeMobile();
      },
    },
    {
      label: "Remove project",
      icon: X,
      destructive: true,
      separator: true,
      onSelect: onRemove,
    },
  ];
  const row = (menu: ReactNode) => (
    <NavigationRow
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 [&_svg]:size-3.5"
            aria-label={`New conversation in ${project.name}`}
            title="New conversation in default session"
            disabled={disabled}
            onClick={() => void create("conversation")}
          >
            <SquarePen className="size-4" />
          </Button>
          {menu}
        </>
      }
    >
      <CollapsibleTrigger className="flex h-8 w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring min-w-0 items-center gap-2 px-2 text-left text-sm">
        <ProjectIcon icon={project.icon} color={project.color} />
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        {pinned && (
          <Pin
            className="size-3 shrink-0 text-muted-foreground"
            aria-label="Pinned project"
          />
        )}
        {!project.available && (
          <span
            className="size-1.5 shrink-0 bg-destructive"
            title="Directory unavailable"
          />
        )}
      </CollapsibleTrigger>
    </NavigationRow>
  );
  return (
    <>
      {compact ? (
        <NavigationMenu label={`Actions for ${project.name}`} actions={actions}>
          {() => (
            <SidebarAction
              compact
              nativeButton={false}
              render={<Link href={href} onClick={closeMobile} />}
              aria-label={project.name}
              title={`${project.name}${pinned ? " · pinned" : ""}`}
            >
              <ProjectIcon icon={project.icon} color={project.color} />
            </SidebarAction>
          )}
        </NavigationMenu>
      ) : (
        <Collapsible open={open} onOpenChange={setOpen}>
          <NavigationMenu
            label={`Actions for ${project.name}`}
            actions={actions}
          >
            {row}
          </NavigationMenu>
          <CollapsibleContent className="project-disclosure">
            <div className="pt-0.5">
              {state.error ? (
                <p role="alert" className="px-4 text-xs text-destructive">
                  {state.error}
                </p>
              ) : (
                <ProjectSessions
                  deviceId={deviceId}
                  projectId={project.id}
                  sessions={state.sessions}
                  busy={busy}
                  createConversation={(sessionId) =>
                    void create("conversation", sessionId)
                  }
                  closeMobile={closeMobile}
                />
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {error && (
        <p
          role="alert"
          className={compact ? "sr-only" : "px-3 text-xs text-destructive"}
        >
          {error}
        </p>
      )}
    </>
  );
}
