"use client";

import { CircleCheck, CircleDashed, LoaderCircle } from "lucide-react";
import { useConnection } from "@/components/connection-provider";
import { Badge } from "@/components/ui/badge";

export function ConnectionStatus() {
  const { status } = useConnection();
  const Icon =
    status === "connected"
      ? CircleCheck
      : status === "connecting"
        ? LoaderCircle
        : CircleDashed;
  return (
    <Badge
      variant="outline"
      className="gap-1.5 font-normal"
      role="status"
      aria-live="polite"
    >
      <Icon className={status === "connecting" ? "animate-spin" : ""} />
      {status === "connected"
        ? "Connected"
        : status === "connecting"
          ? "Connecting"
          : "Disconnected"}
    </Badge>
  );
}
