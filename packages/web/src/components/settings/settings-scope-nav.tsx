"use client";
import { useParams, usePathname } from "next/navigation";
import { machinePreferenceCategory } from "@/lib/preferences-navigation";
import { MachinePreferenceTabs } from "./machine-preference-tabs";
export function SettingsScopeNav() {
  const { deviceId } = useParams<{ deviceId?: string }>();
  const category = machinePreferenceCategory(usePathname());
  return category && deviceId ? (
    <MachinePreferenceTabs category={category} deviceId={deviceId} />
  ) : null;
}
