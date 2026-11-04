"use client";

import {
  ArrowLeft,
  ChevronRight,
  Folder,
  KeyRound,
  Palette,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { useSidebar } from "@/components/ui/sidebar";
import { ProjectTree } from "@/components/workspace/project-tree";

export function ContextRail() {
  const { setOpen, setOpenMobile, isMobile } = useSidebar();
  const { deviceId } = useParams<{ deviceId?: string }>();
  const pathname = usePathname();
  const preferences = pathname.startsWith("/settings");
  const deviceSettings =
    !!deviceId &&
    pathname.startsWith(`/devices/${encodeURIComponent(deviceId)}/settings`);
  const expand = () => (isMobile ? setOpenMobile(true) : setOpen(true));
  return (
    <nav
      aria-label="Workspace navigation"
      className="flex h-svh w-14 shrink-0 flex-col gap-3 bg-context-surface py-2"
    >
      <SidebarAction
        compact
        aria-label="Expand workspace"
        title="Expand workspace"
        onClick={expand}
      >
        <ChevronRight />
      </SidebarAction>
      {preferences ? (
        <SidebarAction
          compact
          nativeButton={false}
          render={<Link href="/settings/appearance" />}
          aria-label="Appearance"
          title="Appearance"
        >
          <Palette />
        </SidebarAction>
      ) : deviceId ? (
        <>
          {deviceSettings ? (
            [
              { id: "providers", label: "Providers", icon: KeyRound },
              { id: "projects", label: "Projects", icon: Folder },
            ].map(({ id, label, icon: Icon }) => {
              const href = `/devices/${encodeURIComponent(deviceId)}/settings/${id}`;
              return (
                <SidebarAction
                  key={id}
                  compact
                  nativeButton={false}
                  render={<Link href={href} />}
                  aria-label={label}
                  title={label}
                  aria-current={pathname === href ? "page" : undefined}
                  className={
                    pathname === href ? "bg-sidebar-accent" : undefined
                  }
                >
                  <Icon />
                </SidebarAction>
              );
            })
          ) : (
            <ProjectTree deviceId={deviceId} compact />
          )}
          <SidebarAction
            compact
            nativeButton={false}
            render={
              <Link
                href={
                  deviceSettings
                    ? `/devices/${encodeURIComponent(deviceId)}`
                    : `/devices/${encodeURIComponent(deviceId)}/settings`
                }
              />
            }
            aria-label={
              deviceSettings ? "Back to workspace" : "Machine settings"
            }
            title={deviceSettings ? "Back to workspace" : "Machine settings"}
            className="mt-auto"
          >
            {deviceSettings ? <ArrowLeft /> : <Settings2 />}
          </SidebarAction>
        </>
      ) : null}
    </nav>
  );
}
