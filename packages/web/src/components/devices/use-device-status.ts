"use client";
import { useConnections } from "@/components/connection-provider";
import type { Device } from "@/lib/devices";
export function useDeviceStatus() {
  const { states } = useConnections();
  return (device: Device) => {
    const status = states[device.id]?.status;
    return status === "connected"
      ? "Connected"
      : status === "connecting"
        ? "Connecting"
        : status === "error"
          ? "Connection failed"
          : "Disconnected";
  };
}
