"use client";
import {
  ChevronRight,
  type Folder,
  FolderClock,
  MessageSquare,
  Plus,
  Settings,
  SquarePen,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { ProjectIcon } from "@/components/projects/project-icon";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function ProjectTree({
  deviceId,
  closeMobile = () => {},
  compact = false,
}: {
  deviceId: string;
  closeMobile?: () => void;
  compact?: boolean;
}) {
  const { projects, connected, error } = useMachineProjects(deviceId);
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
  const projectLinks = projects?.map((p) => {
    const href = `${base}/projects/${encodeURIComponent(p.id)}`;
    if (compact)
      return (
        <SidebarAction
          key={p.id}
          compact
          nativeButton={false}
          render={<Link href={href} onClick={closeMobile} />}
          aria-label={p.name}
          title={p.name}
        >
          <ProjectIcon icon={p.icon} color={p.color} />
        </SidebarAction>
      );
    return (
      <Collapsible key={p.id} className="group/project">
        <div
          className={cn(
            "flex items-center",
            pathname.startsWith(href) && "bg-sidebar-accent",
          )}
        >
          <CollapsibleTrigger className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2 text-sm hover:bg-sidebar-accent [&[aria-expanded=true]>svg:first-child]:rotate-90">
            <ChevronRight className="size-3 shrink-0 transition-transform" />
            <ProjectIcon icon={p.icon} color={p.color} />
            <span className="truncate">{p.name}</span>
            {!p.available && (
              <span
                className="size-1.5 shrink-0 bg-destructive"
                title="Directory unavailable"
              />
            )}
          </CollapsibleTrigger>
          <Button
            nativeButton={false}
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`Settings for ${p.name}`}
            title="Project settings"
            render={<Link href={`${href}/settings`} onClick={closeMobile} />}
          >
            <Settings className="size-3.5" />
          </Button>
        </div>
        <CollapsibleContent className="overflow-hidden">
          <p className="py-3 pl-11 text-xs text-muted-foreground">
            No sessions yet.
          </p>
        </CollapsibleContent>
      </Collapsible>
    );
  });
  if (compact)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {link(`${base}/projects/new`, "Add project", Plus)}
        {projectLinks}
        {link(`${base}/preview/recent-idea`, "Recents", FolderClock)}
      </div>
    );
  return (
    <div className="min-w-0 space-y-6 px-2">
      {link(`${base}/preview/new`, "New conversation", SquarePen)}
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
          <p className="px-3 text-xs text-muted-foreground">No projects yet.</p>
        ) : null}
      </section>
      <section aria-label="Recents">
        <h3 className="mb-2 px-3 text-xs font-medium text-muted-foreground">
          Recents
        </h3>
        {link(`${base}/preview/recent-idea`, "Explore an idea", MessageSquare)}
        {link(
          `${base}/preview/recent-question`,
          "Quick question",
          MessageSquare,
        )}
      </section>
    </div>
  );
}
