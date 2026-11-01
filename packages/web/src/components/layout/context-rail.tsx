"use client";

import {
  ChevronRight,
  Folder,
  Monitor,
  Palette,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { useSidebar } from "@/components/ui/sidebar";

export function ContextRail() {
  const { setOpen, setOpenMobile, isMobile } = useSidebar();
  const { deviceId } = useParams<{ deviceId?: string }>();
  const pathname = usePathname();
  const preferences = pathname.startsWith("/settings");
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
        <>
          <SidebarAction
            compact
            nativeButton={false}
            render={<Link href="/settings/connections" />}
            aria-label="Saved devices"
            title="Saved devices"
          >
            <Monitor />
          </SidebarAction>
          <SidebarAction
            compact
            nativeButton={false}
            render={<Link href="/settings/appearance" />}
            aria-label="Appearance"
            title="Appearance"
          >
            <Palette />
          </SidebarAction>
        </>
      ) : deviceId ? (
        <>
          <SidebarAction
            compact
            aria-label="Show projects"
            title="Show projects"
            onClick={expand}
          >
            <Folder />
          </SidebarAction>
          <SidebarAction
            compact
            nativeButton={false}
            render={
              <Link
                href={`/devices/${encodeURIComponent(deviceId)}/settings`}
              />
            }
            aria-label="Device settings"
            title="Device settings"
            className="mt-auto"
          >
            <Settings2 />
          </SidebarAction>
        </>
      ) : null}
    </nav>
  );
}
