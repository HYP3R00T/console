"use client";

import {
  ArrowLeft,
  ChevronRight,
  Folder,
  FolderClock,
  KeyRound,
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
          {deviceSettings ? (
            <SidebarAction
              compact
              nativeButton={false}
              render={
                <Link
                  href={`/devices/${encodeURIComponent(deviceId)}/settings/providers`}
                />
              }
              aria-label="Providers"
              title="Providers"
              aria-current="page"
              className="bg-sidebar-accent"
            >
              <KeyRound />
            </SidebarAction>
          ) : (
            <>
              <SidebarAction
                compact
                nativeButton={false}
                render={
                  <Link
                    href={`/devices/${encodeURIComponent(deviceId)}/preview/main`}
                  />
                }
                aria-label="Example project"
                title="Example project"
              >
                <Folder />
              </SidebarAction>
              <SidebarAction
                compact
                nativeButton={false}
                render={
                  <Link
                    href={`/devices/${encodeURIComponent(deviceId)}/preview/recent-idea`}
                  />
                }
                aria-label="Recents"
                title="Recents"
              >
                <FolderClock />
              </SidebarAction>
            </>
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
