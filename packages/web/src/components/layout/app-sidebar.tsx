"use client";

import { ChevronLeft, Monitor, Palette, Settings2 } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useDevices } from "@/components/devices/device-provider";
import { SidebarAction } from "@/components/layout/sidebar-action";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { ProjectTree } from "@/components/workspace/project-tree";

export function AppSidebar() {
  const pathname = usePathname();
  const params = useParams<{ deviceId?: string }>();
  const registry = useDevices();
  const { setOpenMobile, isMobile, setOpen } = useSidebar();
  const device = registry.devices.find((item) => item.id === params.deviceId);
  const preferences = pathname.startsWith("/settings");
  const closeMobile = () => setOpenMobile(false);
  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "none"} className="w-full!">
      <SidebarHeader className="px-0 py-2">
        <div className="flex w-[55px] shrink-0 justify-center">
          <SidebarAction
            compact
            aria-label="Collapse workspace"
            title="Collapse workspace"
            onClick={() => (isMobile ? setOpenMobile(false) : setOpen(false))}
          >
            <ChevronLeft />
          </SidebarAction>
        </div>
        <h2 className="truncate px-3 text-sm font-semibold">
          {preferences ? "Preferences" : (device?.name ?? "Workspace")}
        </h2>
        {device && (
          <span className="truncate px-3 font-mono text-[10px] text-muted-foreground">
            {device.url}
          </span>
        )}
      </SidebarHeader>
      <SidebarContent>
        {preferences ? (
          <nav aria-label="Preference categories" className="space-y-1 px-2">
            {[
              {
                label: "Saved devices",
                href: "/settings/connections",
                icon: Monitor,
              },
              {
                label: "Appearance",
                href: "/settings/appearance",
                icon: Palette,
              },
            ].map(({ label, href, icon: Icon }) => (
              <SidebarAction
                key={href}
                nativeButton={false}
                render={<Link href={href} onClick={closeMobile} />}
                aria-current={pathname.startsWith(href) ? "page" : undefined}
                className={
                  pathname.startsWith(href) ? "bg-sidebar-accent" : undefined
                }
              >
                <Icon />
                <span>{label}</span>
              </SidebarAction>
            ))}
          </nav>
        ) : device ? (
          <ProjectTree
            key={device.id}
            deviceId={device.id}
            closeMobile={closeMobile}
          />
        ) : (
          <p className="px-5 text-xs text-muted-foreground">
            Select a device from the rail.
          </p>
        )}
      </SidebarContent>
      {device && (
        <SidebarFooter className="p-2">
          <SidebarAction
            nativeButton={false}
            render={
              <Link
                href={`/devices/${encodeURIComponent(device.id)}/settings`}
                onClick={closeMobile}
              />
            }
            className={
              pathname.endsWith("/settings") ? "bg-sidebar-accent" : undefined
            }
          >
            <Settings2 />
            <span>Device settings</span>
          </SidebarAction>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
