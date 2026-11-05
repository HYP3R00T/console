import {
  Container,
  Cpu,
  Laptop,
  Monitor,
  Server,
  Terminal,
} from "lucide-react";
import type { DeviceAppearance } from "@/lib/devices";
import { cn } from "@/lib/utils";

const icons = {
  monitor: Monitor,
  laptop: Laptop,
  server: Server,
  terminal: Terminal,
  cpu: Cpu,
  container: Container,
};
export const deviceColorClasses = {
  neutral: "text-sidebar-foreground",
  blue: "text-blue-400",
  violet: "text-violet-400",
  green: "text-emerald-400",
  amber: "text-amber-400",
  rose: "text-rose-400",
};

export function DeviceIcon({
  device,
  className,
}: {
  device: DeviceAppearance;
  className?: string;
}) {
  const Icon = icons[device.icon ?? "monitor"];
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0",
        deviceColorClasses[device.color ?? "neutral"],
        className,
      )}
    />
  );
}
