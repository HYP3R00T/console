"use client";

import { ChevronLeft, ChevronRight, Home, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useConnection } from "@/components/connection-provider";
import { useDevices } from "@/components/devices/device-provider";
import { useDeviceStatus } from "@/components/devices/use-device-status";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function DeviceRail() {
  const [expanded, setExpanded] = useState(false);
  const registry = useDevices();
  const connection = useConnection();
  const deviceStatus = useDeviceStatus();
  const params = useParams<{ deviceId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { setOpenMobile, isMobile } = useSidebar();
  function navigate() {
    setOpenMobile(false);
    if (isMobile) setExpanded(false);
  }
  function contents(full: boolean) {
    return (
      <>
        <div className="flex w-full items-center">
          <div className="flex w-[55px] shrink-0 justify-center">
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
        <div className="w-full px-2">
          <SidebarAction
            compact={!full}
            nativeButton={false}
            render={<Link href="/" onClick={navigate} />}
            aria-label="Home"
            title="Home"
            className={pathname === "/" ? "bg-sidebar-accent" : undefined}
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
                    "size-1.5 shrink-0",
                    !full && "absolute right-1 bottom-1",
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
              selected && "bg-sidebar-accent",
            );
            const deviceLink = (
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
                className={deviceClass}
              >
                {deviceContents}
              </SidebarAction>
            );
            if (!full) return <div key={device.id}>{deviceLink}</div>;
            return (
              <Collapsible
                key={device.id}
                className={cn("device-card", selected && "bg-sidebar-accent")}
              >
                <CollapsibleTrigger
                  render={
                    <SidebarAction className="navigation-row group relative min-w-0" />
                  }
                  aria-label={`Details for ${device.name}, ${status}`}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => {
                    if (!selected)
                      router.push(`/devices/${encodeURIComponent(device.id)}`);
                  }}
                >
                  {deviceContents}
                  <ChevronRight className="size-4 transition-transform group-aria-expanded:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="device-details">
                  <div className="space-y-3 px-3 pb-3 pt-1 text-xs">
                    <p className="break-all font-mono text-muted-foreground">
                      {device.url}
                    </p>
                    <p>{status}</p>
                    {status === "Connected" && connection.checkedAt && (
                      <p className="text-muted-foreground">
                        Last checked{" "}
                        {new Date(connection.checkedAt).toLocaleTimeString()}
                      </p>
                    )}
                    {status === "Connection failed" && (
                      <p role="alert" className="break-words text-destructive">
                        {connection.error}
                      </p>
                    )}
                    {status !== "Connected" && status !== "Connecting" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => registry.select(device)}
                      >
                        Connect
                      </Button>
                    )}
                    {status === "Connected" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={connection.disconnect}
                      >
                        Disconnect
                      </Button>
                    )}
                    {status === "Connecting" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={connection.disconnect}
                      >
                        Cancel connection
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </nav>
        <div className="flex w-full flex-col gap-2 px-2">
          <SidebarAction
            compact={!full}
            nativeButton={false}
            render={
              <Link href="/settings/connections/new" onClick={navigate} />
            }
            aria-label="Add device"
            title="Add device"
          >
            <Plus />
            {full && <span>Add device</span>}
          </SidebarAction>
          <SidebarAction
            compact={!full}
            nativeButton={false}
            render={<Link href="/settings/appearance" onClick={navigate} />}
            aria-label="Client preferences"
            title="Client preferences"
            className={
              pathname.startsWith("/settings") ? "bg-sidebar-accent" : undefined
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
        className={cn(
          "flex h-svh shrink-0 flex-col items-center gap-3 overflow-hidden bg-client-surface py-2 motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
          expanded && !isMobile ? "w-64" : "w-14",
        )}
      >
        {contents(expanded && !isMobile)}
      </aside>
      {isMobile && (
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
