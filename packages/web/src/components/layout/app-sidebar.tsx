"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Suspense } from "react";
import { useDevices } from "@/components/devices/device-provider";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { PreferencesNavigation } from "@/components/settings/preferences-navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { ProjectTree } from "@/components/workspace/project-tree";
import {
  isPreferencesPath,
  type PreferenceTarget,
} from "@/lib/preferences-navigation";

export function AppSidebar() {
  const pathname = usePathname(),
    params = useParams<PreferenceTarget>(),
    registry = useDevices();
  const { setOpenMobile } = useSidebar();
  const device = registry.devices.find((item) => item.id === params.deviceId);
  const preferences = isPreferencesPath(pathname);
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
            <Suspense
              fallback={
                <p className="px-3 text-sm text-muted-foreground">
                  Loading preferences…
                </p>
              }
            >
              <PreferencesNavigation closeMobile={closeMobile} />
            </Suspense>
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
      {device && preferences && (
        <SidebarFooter className="p-2">
          <SidebarAction
            nativeButton={false}
            render={
              <Link
                href={`/devices/${encodeURIComponent(device.id)}`}
                onClick={closeMobile}
              />
            }
          >
            <ArrowLeft />
            <span>Back to workspace</span>
          </SidebarAction>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
