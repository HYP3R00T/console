"use client";
import { Layers, Pencil, Pin, PinOff, SquarePen, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { NavigationDropZone } from "@/components/layout/navigation-drag";
import { useNavigationDisclosure } from "@/components/layout/navigation-memory";
import {
  type NavigationAction,
  NavigationMenu,
} from "@/components/layout/navigation-menu";
import { NavigationRow } from "@/components/layout/navigation-row";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { ProjectSessions } from "@/components/sessions/project-sessions";
import { useProjectNavigation } from "@/components/sessions/use-project-navigation";
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
  const [open, setOpen] = useNavigationDisclosure(
    `${deviceId}:project:${project.id}`,
    pathname.startsWith(`${href}/sessions/`),
  );
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
  const actions: NavigationAction[] = [
    {
      id: "create-conversation",
      primary: true,
      shortcutLabel: `New conversation in ${project.name}`,
      label: "New conversation",
      icon: SquarePen,
      disabled,
      onSelect: () => void create("conversation"),
    },
    {
      id: "create-session",
      label: "New session",
      icon: Layers,
      disabled,
      onSelect: () => void create("session"),
    },
    {
      id: "toggle-pin",
      label: pinned ? "Unpin" : "Pin to top",
      icon: pinned ? PinOff : Pin,
      separator: true,
      onSelect: onPin,
    },
    {
      id: "edit",
      label: "Edit project",
      icon: Pencil,
      onSelect: () => {
        router.push(`${href}/settings`);
        closeMobile();
      },
    },
    {
      id: "remove",
      label: "Remove project",
      icon: X,
      destructive: true,
      separator: true,
      onSelect: onRemove,
    },
  ];
  const row = (menu: ReactNode) => (
    <NavigationRow actions={menu}>
      <CollapsibleTrigger className="flex h-7 w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring min-w-0 items-center gap-2 px-2 text-left text-[13px]">
        <ProjectIcon
          icon={project.icon}
          color={project.color}
          className="size-3.5"
        />
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
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
        <NavigationMenu
          kind="project"
          label={`Actions for ${project.name}`}
          actions={actions}
          dragItem={{ kind: "project", id: project.id }}
        >
          {() => (
            <SidebarAction
              compact
              nativeButton={false}
              render={<Link href={href} onClick={closeMobile} />}
              aria-label={project.name}
              title={`${project.name}${pinned ? " · pinned" : ""}`}
            >
              <ProjectIcon
                icon={project.icon}
                color={project.color}
                className="size-3.5"
              />
            </SidebarAction>
          )}
        </NavigationMenu>
      ) : (
        <Collapsible open={open} onOpenChange={setOpen}>
          <NavigationDropZone target={{ projectId: project.id }}>
            <NavigationMenu
              kind="project"
              dragItem={{ kind: "project", id: project.id }}
              label={`Actions for ${project.name}`}
              actions={actions}
            >
              {row}
            </NavigationMenu>
          </NavigationDropZone>
          <CollapsibleContent className="navigation-disclosure">
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
