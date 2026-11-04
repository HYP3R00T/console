"use client";

import { Monitor, Settings2 } from "lucide-react";
import Link from "next/link";
import { useDevices } from "@/components/devices/device-provider";
import { useDeviceStatus } from "@/components/devices/use-device-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function Home() {
  const registry = useDevices();
  const deviceStatus = useDeviceStatus();
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your devices, in this client.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/devices" />}
          variant="outline"
        >
          <Settings2 />
          Manage devices
        </Button>
      </header>
      <section
        aria-label="Connection summary"
        className="grid gap-3 sm:grid-cols-3"
      >
        {[
          ["Saved machines", registry.devices.length],
          [
            "Connected",
            registry.devices.filter(
              (device) => deviceStatus(device) === "Connected",
            ).length,
          ],
          [
            "Connection errors",
            registry.devices.filter(
              (device) => deviceStatus(device) === "Connection failed",
            ).length,
          ],
        ].map(([label, count]) => (
          <div key={label} className="bg-muted/30 p-5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {registry.ready ? count : "—"}
            </p>
          </div>
        ))}
      </section>
      {registry.error && (
        <p role="alert" className="text-sm text-destructive">
          {registry.error}
        </p>
      )}
      {!registry.ready ? (
        <p className="text-sm text-muted-foreground">Loading devices…</p>
      ) : registry.devices.length === 0 ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyTitle>No saved devices</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <section
          aria-label="Device overview"
          className="grid gap-4 xl:grid-cols-2"
        >
          {registry.devices.map((device) => (
            <Link
              key={device.id}
              href={`/devices/${encodeURIComponent(device.id)}`}
              className="min-w-0 space-y-4 border p-5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Monitor className="size-4 shrink-0" />
                <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
                  {device.name}
                </h2>
                <Badge variant="outline">{deviceStatus(device)}</Badge>
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {device.url}
              </p>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
