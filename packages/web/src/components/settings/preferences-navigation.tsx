"use client";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useDevices } from "@/components/devices/device-provider";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clientPreferencePages,
  machinePreferencePages,
  type PreferenceTarget,
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
    pathname = usePathname(),
    router = useRouter();
  const target = preferenceTarget(params, search),
    { devices } = useDevices();
  const device = devices.find((device) => device.id === target.deviceId);
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
  const machine = device
    ? `/devices/${encodeURIComponent(device.id)}`
    : undefined;
  return (
    <nav
      aria-label="Preference categories"
      className="flex flex-col gap-4 px-2"
    >
      {link(
        "All preferences",
        preferencesHref(target),
        pathname === "/settings",
      )}
      <section aria-label="Client preferences">
        <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
          Client · this browser
        </h3>
        {clientPreferencePages.map((page) =>
          link(page.label, preferencesHref(target, page.path)),
        )}
      </section>
      <section aria-label="Machine preferences" className="flex flex-col gap-2">
        <Field className="px-3">
          <FieldLabel htmlFor="preferences-machine-nav">Machine</FieldLabel>
          <Select
            value={device?.id ?? null}
            onValueChange={(value) => {
              if (value) {
                router.push(preferencesHref({ deviceId: value }));
                closeMobile();
              }
            }}
          >
            <SelectTrigger id="preferences-machine-nav" className="w-full">
              <SelectValue placeholder="Choose a machine">
                {device?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {devices.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {machine ? (
          <div>
            {machinePreferencePages.map((page) =>
              link(
                page.label,
                preferencesHref(target, `${machine}/settings/${page.id}`),
              ),
            )}
          </div>
        ) : (
          <p className="px-3 text-xs text-muted-foreground">
            Choose a machine to browse its settings.
          </p>
        )}
      </section>
    </nav>
  );
}
