"use client";

import { useParams } from "next/navigation";
import { useConnection } from "@/components/connection-provider";
import { useDevices } from "@/components/devices/device-provider";
import { ConnectionStatus } from "@/components/layout/connection-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

const previewNames: Record<string, string> = {
  main: "Main conversation",
  subagent: "Subagent preview",
  fork: "Fork preview",
};

export function DeviceWorkspace({
  view,
}: {
  view: "overview" | "settings" | "preview";
}) {
  const params = useParams<{ deviceId: string; conversationId?: string }>();
  const registry = useDevices();
  const connection = useConnection();
  const device = registry.devices.find((item) => item.id === params.deviceId);
  if (!registry.ready)
    return <p className="text-sm text-muted-foreground">Loading device…</p>;
  if (!device)
    return <h1 className="text-xl font-semibold">Device not found</h1>;
  const connected = connection.origin === device.url;
  const ownsPending =
    registry.selectedId === device.id && connection.status === "connecting";
  if (view === "preview") {
    const name = previewNames[params.conversationId ?? ""];
    if (!name)
      return <h1 className="text-xl font-semibold">Preview not found</h1>;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
          <Badge variant="outline">Preview</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {device.name} / Example project / Example session
        </p>
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyTitle>Frontend preview</EmptyTitle>
            <EmptyDescription>
              No conversation or agent is running.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  if (view === "overview")
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {device.name}
          </h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {device.url}
          </p>
        </div>
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyTitle>Device workspace</EmptyTitle>
            <EmptyDescription>
              Select a project preview from the context panel.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Device settings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{device.name}</p>
      </div>
      <section aria-label="Device connection" className="space-y-5 border p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Connection</h2>
          {connected ? (
            <ConnectionStatus />
          ) : (
            <Badge variant="outline">
              {ownsPending ? "Connecting" : "Not connected"}
            </Badge>
          )}
        </div>
        <p className="break-all font-mono text-xs text-muted-foreground">
          {device.url}
        </p>
        {registry.selectedId === device.id && connection.error && (
          <p role="alert" className="text-sm text-destructive">
            {connection.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <>
              <Button variant="outline" onClick={connection.check}>
                Check connection
              </Button>
              <Button variant="outline" onClick={connection.disconnect}>
                Disconnect
              </Button>
            </>
          ) : ownsPending ? (
            <Button variant="outline" onClick={connection.disconnect}>
              Cancel
            </Button>
          ) : (
            <Button onClick={() => registry.select(device)}>Connect</Button>
          )}
        </div>
      </section>
    </div>
  );
}
