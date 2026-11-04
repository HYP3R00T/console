"use client";
import { useConnection } from "@/components/connection-provider";
import { cn } from "@/lib/utils";
export function ConnectionStatus({ deviceId }: { deviceId?: string }) {
  const { status } = useConnection(deviceId);
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 whitespace-nowrap text-xs"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0",
          status === "connected"
            ? "bg-emerald-500"
            : status === "connecting"
              ? "bg-amber-500"
              : status === "error"
                ? "bg-red-500"
                : "bg-muted-foreground/50",
        )}
      />
      {status === "connected"
        ? "Connected"
        : status === "connecting"
          ? "Connecting"
          : status === "error"
            ? "Connection failed"
            : "Disconnected"}
    </span>
  );
}
