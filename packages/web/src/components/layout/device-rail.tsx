"use client";

import {
  ChevronLeft,
  ChevronRight,
  Home,
  Monitor,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import { useDevices } from "@/components/devices/device-provider";
import { useDeviceStatus } from "@/components/devices/use-device-status";
import { SidebarAction } from "@/components/layout/sidebar-action";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function DeviceRail({
  hidden = false,
  compactOnly = false,
}: {
  hidden?: boolean;
  compactOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const registry = useDevices();
  const deviceStatus = useDeviceStatus();
  const params = useParams<{ deviceId?: string }>();
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  function navigate() {
    setOpenMobile(false);
    if (isMobile) setExpanded(false);
  }
  function contents(full: boolean) {
    return (
      <>
        {!compactOnly && (
          <div className="flex w-full items-center">
            <div className="flex w-14 shrink-0 justify-center">
              <SidebarAction
                compact
                aria-label={full ? "Collapse devices" : "Expand devices"}
                title={full ? "Collapse devices" : "Expand devices"}
                onClick={() => setExpanded(!expanded)}
              >
                {full ? <ChevronLeft /> : <ChevronRight />}
              </SidebarAction>
            </div>
            {full && (
              <span className="min-w-0 truncate text-sm font-semibold">
                Console
              </span>
            )}
          </div>
        )}
        <div className="w-full px-2">
          <SidebarAction
            compact={!full}
            nativeButton={false}
            render={<Link href="/" onClick={navigate} />}
            aria-label="Home"
            title="Home"
            className={pathname === "/" ? "sidebar-selected" : undefined}
          >
            <Home />
            {full && <span>Home</span>}
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
            const deviceContents = (
              <>
                <span className="shrink-0 font-mono text-[11px]">
                  {initials}
                </span>
                {full && (
                  <span className="min-w-0 flex-1 truncate text-left">
                    {device.name}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    !full &&
                      "absolute right-1 bottom-1 ring-2 ring-client-surface",
                    status === "Connected"
                      ? "bg-emerald-500"
                      : status === "Connecting"
                        ? "bg-amber-500"
                        : status === "Connection failed"
                          ? "bg-red-500"
                          : "bg-muted-foreground/50",
                  )}
                />
              </>
            );
            const deviceClass = cn(
              "relative min-w-0",
              selected && "sidebar-selected",
            );
            const deviceLink = (
              <SidebarAction
                compact={!full}
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
                className={deviceClass}
              >
                {deviceContents}
              </SidebarAction>
            );
            return <div key={device.id}>{deviceLink}</div>;
          })}
        </nav>
        <div className="flex w-full flex-col gap-2 px-2">
          <SidebarAction
            compact={!full}
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
            {full && <span>Manage devices</span>}
          </SidebarAction>
          <SidebarAction
            compact={!full}
            nativeButton={false}
            render={<Link href="/settings/appearance" onClick={navigate} />}
            aria-label="Client preferences"
            title="Client preferences"
            className={
              pathname.startsWith("/settings") ? "sidebar-selected" : undefined
            }
          >
            <Settings2 />
            {full && <span>Client preferences</span>}
          </SidebarAction>
        </div>
      </>
    );
  }
  return (
    <>
      <aside
        aria-label="Devices and client preferences"
        inert={hidden}
        aria-hidden={hidden}
        className={cn(
          "flex h-full shrink-0 flex-col items-center gap-3 overflow-hidden bg-client-surface py-2 motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
          hidden
            ? "w-0"
            : expanded && !isMobile && !compactOnly
              ? "w-64"
              : "w-14",
        )}
      >
        {contents(expanded && !isMobile && !compactOnly)}
      </aside>
      {isMobile && !compactOnly && (
        <Sheet open={expanded} onOpenChange={setExpanded}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="flex w-64 flex-col gap-3 bg-client-surface py-2"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Devices and client preferences</SheetTitle>
            </SheetHeader>
            {contents(true)}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
