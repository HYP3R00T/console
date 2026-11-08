"use client";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useDevices } from "@/components/devices/device-provider";
import { SidebarAction } from "@/components/layout/sidebar-action";
import {
  clientPreferencePages,
  machinePreferenceCategory,
  machinePreferenceHref,
  machinePreferencePages,
  type PreferenceTarget,
  preferenceMachine,
  preferencesHref,
  preferenceTarget,
} from "@/lib/preferences-navigation";

export function PreferencesNavigation({
  closeMobile,
}: {
  closeMobile: () => void;
}) {
  const params = useParams<PreferenceTarget>(),
    search = useSearchParams(),
    pathname = usePathname();
  const target = preferenceTarget(params, search),
    { devices } = useDevices();
  const device = preferenceMachine(devices, target.deviceId);
  function link(
    label: string,
    href: string,
    active = pathname === href.split("?")[0],
  ) {
    return (
      <SidebarAction
        key={label}
        nativeButton={false}
        render={<Link href={href} onClick={closeMobile} />}
        aria-current={active ? "page" : undefined}
        className={active ? "sidebar-selected" : undefined}
      >
        <span>{label}</span>
      </SidebarAction>
    );
  }
  return (
    <nav
      aria-label="Preference categories"
      className="flex flex-col gap-4 px-2"
    >
      <section aria-label="Client preferences">
        <h3 className="px-3 pt-2 pb-2 text-sm font-semibold text-foreground">
          Client
        </h3>
        {clientPreferencePages.map((page) =>
          link(page.label, preferencesHref(target, page.path)),
        )}
      </section>
      <section aria-label="Machine preferences">
        <h3 className="px-3 pt-2 pb-2 text-sm font-semibold text-foreground">
          Machine
        </h3>
        {machinePreferencePages.map((page) =>
          link(
            page.label,
            machinePreferenceHref(page.id, device?.id),
            machinePreferenceCategory(pathname) === page.id,
          ),
        )}
      </section>
    </nav>
  );
}
