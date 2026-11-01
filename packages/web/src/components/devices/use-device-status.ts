"use client";

import { useConnection } from "@/components/connection-provider";
import { useDevices } from "@/components/devices/device-provider";
import type { Device } from "@/lib/devices";

export function useDeviceStatus() {
  const connection = useConnection();
  const registry = useDevices();
  return (device: Device) =>
    connection.origin === device.url
      ? "Connected"
      : registry.selectedId === device.id && connection.status === "connecting"
        ? "Connecting"
        : registry.selectedId === device.id && connection.status === "error"
          ? "Connection failed"
          : "Not connected";
}
