"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useConnection } from "@/components/connection-provider";
import { useDevices } from "@/components/devices/device-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function Choice({
  id,
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value?: string;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value ?? null}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder}>
            {options.find((option) => option.value === value)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
function Destination({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={<Link href={href} />}
    >
      {children}
    </Button>
  );
}

export function PreferencesHub() {
  const search = useSearchParams(),
    router = useRouter(),
    registry = useDevices();
  const target = preferenceTarget({}, search);
  const device = registry.devices.find((item) => item.id === target.deviceId);
  const { status } = useConnection(device?.id ?? "");
  function select(next: PreferenceTarget) {
    router.replace(preferencesHref(next), { scroll: false });
  }
  const machine = device && `/devices/${encodeURIComponent(device.id)}`;
  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Preferences</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Client preferences for this browser and shared settings for your
          machines.
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
            <CardDescription>
              Only this browser. Shared across the machines you view.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {clientPreferencePages.map((page) => (
              <Destination
                key={page.path}
                href={preferencesHref(target, page.path)}
              >
                {page.label}
              </Destination>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Machine</CardTitle>
            <CardDescription>
              Shared by every client connected to the selected backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Choice
              id="preferences-machine"
              label="Machine"
              value={device?.id}
              placeholder="Choose a saved machine"
              options={registry.devices.map((device) => ({
                value: device.id,
                label: device.name,
              }))}
              onChange={(deviceId) => select({ deviceId })}
            />
            {device && (
              <p role="status" className="text-xs text-muted-foreground">
                {status === "connected"
                  ? "Connected. Selecting settings does not change the connection."
                  : status === "connecting"
                    ? "Connecting to this machine…"
                    : "Not connected. Connect through Manage devices to edit backend settings."}
              </p>
            )}
            {!registry.devices.length && registry.ready && (
              <p className="text-sm text-muted-foreground">
                Add a machine in <Link href="/devices">Manage devices</Link>.
              </p>
            )}
            {machine && (
              <div className="flex flex-wrap gap-2">
                {machinePreferencePages.map((page) => (
                  <Destination
                    key={page.id}
                    href={preferencesHref(
                      target,
                      `${machine}/settings/${page.id}`,
                    )}
                  >
                    {page.label}
                  </Destination>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">
        Project, session and conversation configuration lives in the right
        sidebar of an open conversation.
      </p>
    </div>
  );
}
