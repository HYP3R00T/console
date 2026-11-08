"use client";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import {
  isPreferencesPath,
  type PreferenceTarget,
  preferencesHref,
  preferenceTarget,
} from "@/lib/preferences-navigation";
export function SettingsScopeNav() {
  const pathname = usePathname(),
    params = useParams<PreferenceTarget>();
  const target = preferenceTarget(params, useSearchParams());
  if (!isPreferencesPath(pathname) || pathname === "/settings") return null;
  const scope = params.conversationId
    ? "Conversation"
    : params.sessionId
      ? "Session"
      : params.projectId
        ? "Project"
        : params.deviceId
          ? "Machine"
          : "Client";
  return (
    <nav
      aria-label="Preferences location"
      className="mb-5 flex flex-wrap gap-2 border-b pb-3 text-sm"
    >
      <Link href={preferencesHref(target)}>All preferences</Link>
      <span aria-hidden="true">/</span>
      <span className="text-muted-foreground">{scope}</span>
    </nav>
  );
}
