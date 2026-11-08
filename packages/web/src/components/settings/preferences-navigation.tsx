"use client";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useDevices } from "@/components/devices/device-provider";
import { useNavigationDisclosure } from "@/components/layout/navigation-memory";
import { SidebarAction } from "@/components/layout/sidebar-action";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { cn } from "@/lib/utils";

function PreferenceGroup({
  label,
  group,
  children,
}: {
  label: string;
  group: "client" | "machine";
  children: ReactNode;
}) {
  const [open, setOpen] = useNavigationDisclosure(`preferences:${group}`, true);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<section aria-label={`${label} preferences`} />}
    >
      <h3>
        <CollapsibleTrigger className="sidebar-action flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring">
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-180",
              open && "rotate-90",
            )}
          />
          <span>{label}</span>
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent keepMounted className="navigation-disclosure">
        <div className="ml-6 border-l border-sidebar-border pt-1 pl-4">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

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
      <PreferenceGroup label="Client" group="client">
        {clientPreferencePages.map((page) =>
          link(page.label, preferencesHref(target, page.path)),
        )}
      </PreferenceGroup>
      <PreferenceGroup label="Machine" group="machine">
        {machinePreferencePages.map((page) =>
          link(
            page.label,
            machinePreferenceHref(page.id, device?.id),
            machinePreferenceCategory(pathname) === page.id,
          ),
        )}
      </PreferenceGroup>
    </nav>
  );
}
