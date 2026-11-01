"use client";

import { useParams } from "next/navigation";
import { useDevices } from "@/components/devices/device-provider";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

const previewNames: Record<string, string> = {
  main: "Main conversation",
  new: "New conversation",
  "recent-idea": "Explore an idea",
  "recent-question": "Quick question",
  subagent: "Subagent preview",
  fork: "Fork preview",
};

export function DeviceWorkspace({ view }: { view: "overview" | "preview" }) {
  const params = useParams<{ deviceId: string; conversationId?: string }>();
  const registry = useDevices();
  const device = registry.devices.find((item) => item.id === params.deviceId);
  if (!registry.ready)
    return <p className="text-sm text-muted-foreground">Loading device…</p>;
  if (!device)
    return <h1 className="text-xl font-semibold">Device not found</h1>;
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
          {device.name} /{" "}
          {["new", "recent-idea", "recent-question"].includes(
            params.conversationId ?? "",
          )
            ? "Outside projects"
            : "Example project / Example session"}
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
              Add or open a project from the sidebar. Recents remains a
              conversation preview.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  return null;
}
