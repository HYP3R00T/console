"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDevices } from "@/components/devices/device-provider";
import {
  type MachinePreferenceCategory,
  machinePreferenceHref,
} from "@/lib/preferences-navigation";

export function MachinePreferenceLanding({
  category,
  label,
}: {
  category: MachinePreferenceCategory;
  label: string;
}) {
  const { devices, ready, error } = useDevices();
  const router = useRouter();
  const deviceId = devices[0]?.id;
  useEffect(() => {
    if (ready && deviceId)
      router.replace(machinePreferenceHref(category, deviceId));
  }, [ready, deviceId, category, router]);
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">{label}</h1>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !ready || deviceId ? (
        <p role="status">Loading machine settings…</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add a machine in <Link href="/devices">Manage devices</Link> to
          configure it.
        </p>
      )}
    </section>
  );
}
