"use client";

import { useParams } from "next/navigation";
import { useDevices } from "@/components/devices/device-provider";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function DeviceWorkspace() {
  const params = useParams<{ deviceId: string }>();
  const registry = useDevices();
  const device = registry.devices.find((item) => item.id === params.deviceId);
  if (!registry.ready)
    return <p className="text-sm text-muted-foreground">Loading device…</p>;
  if (!device)
    return <h1 className="text-xl font-semibold">Device not found</h1>;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{device.name}</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {device.url}
        </p>
      </div>
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyTitle>Device workspace</EmptyTitle>
          <EmptyDescription>
            Start a conversation or open a project from the sidebar.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
