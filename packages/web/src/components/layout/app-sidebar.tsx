"use client";

import {
  Archive,
  ArrowLeft,
  Bot,
  Folder,
  Keyboard,
  KeyRound,
  Palette,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useDevices } from "@/components/devices/device-provider";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const { setOpenMobile } = useSidebar();
  const device = registry.devices.find((item) => item.id === params.deviceId);
  const preferences = pathname.startsWith("/settings");
  const deviceSettings =
    !!device &&
    pathname.startsWith(`/devices/${encodeURIComponent(device.id)}/settings`);
  const closeMobile = () => setOpenMobile(false);
  return (
    <Sidebar collapsible="none" className="w-full!">
      <SidebarHeader className="px-0 pb-1 pt-2">
        {preferences && (
          <h2 className="truncate px-3 text-sm font-semibold">Preferences</h2>
        )}
      </SidebarHeader>
      <SidebarContent className="overflow-hidden">
        <ScrollArea
          className="min-h-0 flex-1"
          viewportClassName="data-[has-overflow-y]:pr-3"
        >
          {preferences ? (
            <nav aria-label="Preference categories" className="space-y-1 px-2">
              {[
                {
                  label: "Appearance",
                  href: "/settings/appearance",
                  icon: Palette,
                },
                {
                  label: "Keyboard shortcuts",
                  href: "/settings/shortcuts",
                  icon: Keyboard,
                },
              ].map(({ label, href, icon: Icon }) => (
                <SidebarAction
                  key={href}
                  nativeButton={false}
                  render={<Link href={href} onClick={closeMobile} />}
                  aria-current={pathname.startsWith(href) ? "page" : undefined}
                  className={
                    pathname.startsWith(href) ? "sidebar-selected" : undefined
                  }
                >
                  <Icon />
                  <span>{label}</span>
                </SidebarAction>
              ))}
            </nav>
          ) : deviceSettings && device ? (
            <nav
              aria-label="Machine setting categories"
              className="space-y-1 px-2"
            >
              {[
                { id: "providers", label: "Providers", icon: KeyRound },
                { id: "runtime", label: "Runtime defaults", icon: Bot },
                { id: "projects", label: "Projects", icon: Folder },
                { id: "archives", label: "Archives", icon: Archive },
              ].map(({ id, label, icon: Icon }) => {
                const href = `/devices/${encodeURIComponent(device.id)}/settings/${id}`;
                const active = pathname === href;
                return (
                  <SidebarAction
                    key={id}
                    nativeButton={false}
                    render={<Link href={href} onClick={closeMobile} />}
                    aria-current={active ? "page" : undefined}
                    className={`h-7 gap-2 px-2 [&_svg]:size-3 ${active ? "sidebar-selected" : ""}`}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarAction>
                );
              })}
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
        </ScrollArea>
      </SidebarContent>
      {device && (
        <SidebarFooter className="p-2">
          <SidebarAction
            className="h-7 gap-2 px-2 [&_svg]:size-3"
            nativeButton={false}
            render={
              <Link
                href={
                  deviceSettings
                    ? `/devices/${encodeURIComponent(device.id)}`
                    : `/devices/${encodeURIComponent(device.id)}/settings/providers`
                }
                onClick={closeMobile}
              />
            }
          >
            {deviceSettings ? <ArrowLeft /> : <Settings2 />}
            <span>
              {deviceSettings ? "Back to workspace" : "Machine settings"}
            </span>
          </SidebarAction>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
