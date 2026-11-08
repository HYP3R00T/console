"use client";
import Link from "next/link";
import { useConnection } from "@/components/connection-provider";
import { useDevices } from "@/components/devices/device-provider";
import { Button } from "@/components/ui/button";
import type { Device } from "@/lib/devices";
import {
  type MachinePreferenceCategory,
  machinePreferenceHref,
} from "@/lib/preferences-navigation";

function MachineTab({
  device,
  category,
  selected,
}: {
  device: Device;
  category: MachinePreferenceCategory;
  selected: boolean;
}) {
  const { status } = useConnection(device.id);
  return (
    <Button
      variant={selected ? "secondary" : "outline"}
      nativeButton={false}
      render={<Link href={machinePreferenceHref(category, device.id)} />}
      aria-current={selected ? "page" : undefined}
      className="h-auto min-h-16 min-w-40 max-w-full flex-col items-start gap-1 px-4 py-3 aria-[current=page]:ring-1 aria-[current=page]:ring-ring"
    >
      <span className="max-w-full truncate">{device.name}</span>
      <span className="text-muted-foreground">
        {status === "connected"
          ? "Connected"
          : status === "connecting"
            ? "Connecting…"
            : "Disconnected"}
      </span>
    </Button>
  );
}
export function MachinePreferenceTabs({
  category,
  deviceId,
}: {
  category: MachinePreferenceCategory;
  deviceId: string;
}) {
  const { devices, ready, error } = useDevices();
  return (
    <div className="mb-6 flex shrink-0 flex-col gap-3">
      <nav aria-label="Machines" className="flex flex-wrap gap-2">
        {devices.map((device) => (
          <MachineTab
            key={device.id}
            device={device}
            category={category}
            selected={device.id === deviceId}
          />
        ))}
      </nav>
      {!ready && <p role="status">Loading machines…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {ready && !devices.length && (
        <p className="text-sm text-muted-foreground">
          Add a machine in <Link href="/devices">Manage devices</Link> to
          configure it.
        </p>
      )}
    </div>
  );
}
