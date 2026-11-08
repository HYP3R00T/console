"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDevices } from "@/components/devices/device-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  clientPreferencePages,
  machinePreferenceHref,
  machinePreferencePages,
  preferenceMachine,
  preferencesHref,
  preferenceTarget,
} from "@/lib/preferences-navigation";

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
    registry = useDevices();
  const target = preferenceTarget({}, search);
  const device = preferenceMachine(registry.devices, target.deviceId);
  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Preferences</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Appearance, shortcuts and configuration for your workspace.
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
            <CardDescription>
              Appearance, keyboard shortcuts and configuration backups.
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
              Choose a category, then select a machine at the top of its
              settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {machinePreferencePages.map((page) => (
                <Destination
                  key={page.id}
                  href={machinePreferenceHref(page.id, device?.id)}
                >
                  {page.label}
                </Destination>
              ))}
            </div>
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
