"use client";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import {
  isPreferencesPath,
  machinePreferenceCategory,
  type PreferenceTarget,
  preferencesHref,
  preferenceTarget,
} from "@/lib/preferences-navigation";
import { MachinePreferenceTabs } from "./machine-preference-tabs";
export function SettingsScopeNav() {
  const pathname = usePathname(),
    params = useParams<PreferenceTarget>();
  const target = preferenceTarget(params, useSearchParams());
  if (!isPreferencesPath(pathname) || pathname === "/settings") return null;
  const category = machinePreferenceCategory(pathname);
  const scope = params.conversationId
    ? "Conversation"
    : params.sessionId
      ? "Session"
      : params.projectId
        ? "Project"
        : params.deviceId || category
          ? "Machine"
          : "Client";
  return (
    <>
      <nav
        aria-label="Preferences location"
        className="mb-5 flex flex-wrap gap-2 border-b pb-3 text-sm"
      >
        <Link href={preferencesHref(target)}>All preferences</Link>
        <span aria-hidden="true">/</span>
        <span className="text-muted-foreground">{scope}</span>
      </nav>
      {category && params.deviceId && (
        <MachinePreferenceTabs category={category} deviceId={params.deviceId} />
      )}
    </>
  );
}
