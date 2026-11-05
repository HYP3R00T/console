"use client";

import { Home, Monitor, Settings2 } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useDevices } from "@/components/devices/device-provider";
import { useDeviceStatus } from "@/components/devices/use-device-status";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function DeviceRail() {
  const registry = useDevices();
  const deviceStatus = useDeviceStatus();
  const params = useParams<{ deviceId?: string }>();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const navigate = () => setOpenMobile(false);
  return (
    <aside
      aria-label="Devices and client preferences"
      className="flex h-full w-14 shrink-0 flex-col items-center gap-3 overflow-hidden bg-client-surface py-2"
    >
      <div className="w-full px-2">
        <SidebarAction
          compact
          nativeButton={false}
          render={<Link href="/" onClick={navigate} />}
          aria-label="Home"
          title="Home"
          className={pathname === "/" ? "sidebar-selected" : undefined}
        >
          <Home />
        </SidebarAction>
      </div>
      <nav
        aria-label="Saved devices"
        className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-y-auto px-2"
      >
        {registry.devices.map((device) => {
          const selected = params.deviceId === device.id;
          const status = deviceStatus(device);
          const initials = device.name
            .split(/\s+/)
            .map((word) => word[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <div key={device.id}>
              <SidebarAction
                compact
                nativeButton={false}
                render={
                  <Link
                    href={`/devices/${encodeURIComponent(device.id)}`}
                    onClick={navigate}
                  />
                }
                aria-label={`Open ${device.name}, ${status}`}
                aria-current={selected ? "page" : undefined}
                title={`${device.name} · ${status}`}
                className={cn(
                  "relative min-w-0",
                  selected && "sidebar-selected",
                )}
              >
                <span className="shrink-0 font-mono text-[11px]">
                  {initials}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute right-1 bottom-1 size-1.5 shrink-0 rounded-full ring-2 ring-client-surface",
                    status === "Connected"
                      ? "bg-emerald-500"
                      : status === "Connecting"
                        ? "bg-amber-500"
                        : status === "Connection failed"
                          ? "bg-red-500"
                          : "bg-muted-foreground/50",
                  )}
                />
              </SidebarAction>
            </div>
          );
        })}
      </nav>
      <div className="flex w-full flex-col gap-2 px-2">
        <SidebarAction
          compact
          nativeButton={false}
          render={<Link href="/devices" onClick={navigate} />}
          aria-label="Manage devices"
          title="Manage devices"
          className={
            pathname === "/devices" || pathname === "/devices/new"
              ? "sidebar-selected"
              : undefined
          }
        >
          <Monitor />
        </SidebarAction>
        <SidebarAction
          compact
          nativeButton={false}
          render={<Link href="/settings/appearance" onClick={navigate} />}
          aria-label="Client preferences"
          title="Client preferences"
          className={
            pathname.startsWith("/settings") ? "sidebar-selected" : undefined
          }
        >
          <Settings2 />
        </SidebarAction>
      </div>
    </aside>
  );
}
