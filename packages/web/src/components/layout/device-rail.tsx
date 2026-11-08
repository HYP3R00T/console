"use client";

import { MonitorCog, Settings2 } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import { DeviceIcon } from "@/components/devices/device-icon";
import { useDevices } from "@/components/devices/device-provider";
import { EditDeviceDialog } from "@/components/devices/edit-device-dialog";
import { useDeviceStatus } from "@/components/devices/use-device-status";
import { useNavigationMemory } from "@/components/layout/navigation-memory";
import { SidebarAction } from "@/components/layout/sidebar-action";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useSidebar } from "@/components/ui/sidebar";
import type { Device } from "@/lib/devices";
import {
  isPreferencesPath,
  preferencesHref,
} from "@/lib/preferences-navigation";
import { cn } from "@/lib/utils";

export function DeviceRail() {
  const registry = useDevices();
  const { memory } = useNavigationMemory();
  const [editing, setEditing] = useState<Device>();
  const [menuDevice, setMenuDevice] = useState<string>();
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
          aria-current={pathname === "/" ? "page" : undefined}
          tooltip="Home"
          className={pathname === "/" ? "sidebar-selected" : undefined}
        >
          <span
            aria-hidden="true"
            className="size-7 shrink-0 bg-current mask-[url(/console.svg)] mask-contain mask-center mask-no-repeat"
          />
        </SidebarAction>
      </div>
      <nav
        aria-label="Saved devices"
        className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-y-auto px-2"
      >
        {registry.devices.map((device) => {
          const selected = params.deviceId === device.id;
          const status = deviceStatus(device);
          return (
            <ContextMenu
              key={device.id}
              onOpenChange={(open) =>
                setMenuDevice(open ? device.id : undefined)
              }
            >
              <ContextMenuTrigger
                className="block"
                aria-description="Right-click or press Shift+F10 to edit this machine."
              >
                <SidebarAction
                  compact
                  nativeButton={false}
                  render={
                    <Link
                      href={
                        memory.routes[device.id] ??
                        `/devices/${encodeURIComponent(device.id)}`
                      }
                      onClick={navigate}
                    />
                  }
                  aria-label={`Open ${device.name}, ${status}`}
                  aria-current={selected ? "page" : undefined}
                  tooltip={
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium">{device.name}</span>
                      <span className="text-muted-foreground">{status}</span>
                      <span className="break-all font-mono text-[11px] text-muted-foreground">
                        {device.url}
                      </span>
                    </span>
                  }
                  tooltipDisabled={menuDevice === device.id || !!editing}
                  className={cn(
                    "relative min-w-0",
                    menuDevice === device.id && "bg-sidebar-accent",
                    selected && "sidebar-selected",
                  )}
                >
                  <DeviceIcon device={device} />
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
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => setEditing(device)}>
                  <MonitorCog />
                  Edit machine
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </nav>
      <div className="flex w-full flex-col gap-2 px-2">
        <SidebarAction
          compact
          nativeButton={false}
          render={<Link href="/devices" onClick={navigate} />}
          aria-label="Manage devices"
          tooltip="Manage devices"
          className={
            pathname === "/devices" || pathname === "/devices/new"
              ? "sidebar-selected"
              : undefined
          }
        >
          <MonitorCog />
        </SidebarAction>
        <SidebarAction
          compact
          nativeButton={false}
          render={
            <Link
              href={preferencesHref({ deviceId: params.deviceId })}
              onClick={navigate}
            />
          }
          aria-label="Preferences"
          tooltip="Preferences"
          className={
            isPreferencesPath(pathname) ? "sidebar-selected" : undefined
          }
        >
          <Settings2 />
        </SidebarAction>
      </div>
      {editing && (
        <EditDeviceDialog
          key={editing.id}
          device={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </aside>
  );
}
