"use client";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useDevices } from "@/components/devices/device-provider";
import { SettingsDisclosure } from "@/components/settings/settings-presentation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  type Capability,
  type CapabilityScope,
  capabilities,
  searchCapabilities,
} from "@/lib/capabilities";
import {
  type PreferenceTarget,
  preferenceTarget,
} from "@/lib/preferences-navigation";
import { useCommands, useRegisterCommands } from "./command-registry";

const ownerLabels = {
  client: "Client",
  machine: "Machine",
  project: "Project",
  session: "Session",
  conversation: "Conversation",
  work: "Work item",
} as const;

const machineCategories: Record<string, string> = {
  providers: "providers",
  defaults: "runtime",
  guidance: "guidance",
  projectsRoot: "projects",
  reviewerProfile: "reviewers",
  agentProfile: "agents",
  mcp: "mcp",
  ssh: "ssh",
  extensions: "extensions",
  archives: "archives",
};
export function CapabilityDirectory() {
  const commands = useCommands();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const [scope, setScope] = useState("all"),
    [machine, setMachine] = useState<string>();
  const params = useParams<PreferenceTarget>(),
    search = useSearchParams(),
    route = usePathname();
  const target = preferenceTarget(params, search),
    { devices } = useDevices();
  const machineId = machine ?? target.deviceId ?? devices[0]?.id;
  const currentRoute = useRef(route);
  currentRoute.current = route;
  const pending = useRef<() => void>(undefined);
  useRegisterCommands({
    "help.capabilities": {
      run: () => {
        setQuery("");
        setScope("all");
        setMachine(undefined);
        setOpen(true);
      },
    },
  });
  const results = searchCapabilities(
    query,
    scope === "all" ? undefined : (scope as CapabilityScope),
  );
  const groups = new Map<string, Capability[]>();
  for (const entry of results)
    groups.set(entry.location, [...(groups.get(entry.location) ?? []), entry]);
  function operation(entry: Capability) {
    if (entry.scope === "machine") {
      const category = machineCategories[entry.id.split(".")[0]];
      if (!machineId || !category) return;
      return {
        id: "settings.open" as const,
        input: {
          destination: `machine:${category}`,
          target: { deviceId: machineId },
        },
      };
    }
    if (!entry.command) return;
    return { id: entry.command, input: undefined };
  }
  function availability(entry: Capability) {
    const action = operation(entry);
    if (!action)
      return entry.scope === "machine"
        ? "Add or select a machine first."
        : `Use ${entry.location.toLowerCase()}.`;
    const handler = commands.get(action.id);
    return (
      handler?.disabled ??
      (!handler ? "Open the owning workspace to use this control." : undefined)
    );
  }
  function invoke(entry: Capability) {
    const action = operation(entry);
    if (!action) return;
    const capturedRoute = route,
      url = window.location.href;
    pending.current = () => {
      if (
        currentRoute.current !== capturedRoute ||
        window.location.href !== url
      )
        return;
      Promise.resolve(commands.invoke(action.id, action.input)).catch((cause) =>
        toast.add({
          type: "error",
          title: "Could not open capability",
          description:
            cause instanceof Error ? cause.message : "Operation failed.",
        }),
      );
    };
    setOpen(false);
  }
  function groupContent(entries: Capability[]) {
    const first = entries[0],
      reason = availability(first),
      executable = ["conversation.stop", "conversation.continue"].includes(
        first.command ?? "",
      );
    return (
      <div className="flex flex-col gap-4">
        <p className="text-xs leading-relaxed text-foreground/65">
          {first.effect}
        </p>
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <article key={entry.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-medium text-foreground">
                  {entry.label}
                </h4>
                <span className="text-[11px] capitalize text-foreground/55">
                  {entry.kind}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-foreground/70">
                {entry.description}
              </p>
            </article>
          ))}
        </div>
        {operation(first) ? (
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={!!reason}
              onClick={() => invoke(first)}
            >
              {executable ? first.label : "Open controls"}
            </Button>
            {reason && (
              <p className="mt-2 text-xs text-foreground/65">{reason}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-foreground/65">{reason}</p>
        )}
      </div>
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) pending.current = undefined;
        setOpen(next);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen && pending.current) {
          const run = pending.current;
          pending.current = undefined;
          queueMicrotask(() => {
            try {
              run();
            } catch (cause) {
              toast.add({
                type: "error",
                title: "Command unavailable",
                description:
                  cause instanceof Error ? cause.message : "Try again.",
              });
            }
          });
        }
      }}
    >
      <DialogContent className="flex h-[85svh] max-h-[calc(100svh-2rem)] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Console capabilities</DialogTitle>
          <DialogDescription>
            Find settings, actions and information. Each entry identifies its
            owner, location and effect.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          <Input
            className="min-w-0 flex-1 basis-64"
            aria-label="Search capabilities"
            placeholder="Search sandbox, retry delay, theme, fork…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            value={scope}
            onValueChange={(value) => {
              if (value) setScope(value);
            }}
          >
            <SelectTrigger aria-label="Capability owner">
              <SelectValue>
                {scope === "all"
                  ? "All owners"
                  : ownerLabels[scope as CapabilityScope]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {[
                  "all",
                  "client",
                  "machine",
                  "project",
                  "session",
                  "conversation",
                  "work",
                ].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === "all"
                      ? "All owners"
                      : ownerLabels[value as CapabilityScope]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {devices.length > 0 && (
          <Select
            value={machineId ?? ""}
            onValueChange={(value) => {
              if (value) setMachine(value);
            }}
          >
            <SelectTrigger
              aria-label="Machine settings target"
              className="w-full"
            >
              <SelectValue>
                {devices.find((device) => device.id === machineId)?.name ??
                  "Select machine"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        <p role="status" className="text-xs text-foreground/60">
          {results.length} of {capabilities.length} capabilities · Machine
          selection targets machine settings only.
        </p>
        <ScrollArea
          className="min-h-0 flex-1 overflow-hidden"
          viewportClassName="flex flex-col gap-6 pr-3"
          aria-label="Capability results"
        >
          {[...groups].map(([location, entries]) => (
            <section key={location} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                {location}
                <span className="ml-2 text-[11px] font-normal capitalize text-foreground/55">
                  {ownerLabels[entries[0].scope]}
                </span>
              </h3>
              {query.trim() ? (
                groupContent(entries)
              ) : (
                <SettingsDisclosure title={`${entries.length} capabilities`}>
                  {groupContent(entries)}
                </SettingsDisclosure>
              )}
            </section>
          ))}
          {results.length === 0 && (
            <p className="text-sm text-foreground/65">
              No matching capability. Try its purpose or owning scope.
            </p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
