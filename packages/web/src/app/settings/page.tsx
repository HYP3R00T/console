"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { useBackend } from "@/components/connection-context";
import { MachineSettings } from "@/components/machine-settings";
import { ModelPreferencesSettings } from "@/components/model-preferences";
import ProviderSettings from "@/components/provider-settings";

function SettingsContent() {
  const params = useSearchParams();
  const section = ["machine", "providers"].includes(params.get("section") ?? "")
    ? params.get("section")
    : "models";
  const { id, connections, select } = useBackend();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-5 sm:flex-row sm:p-8">
      <nav
        aria-label="Settings sections"
        className="flex shrink-0 gap-2 sm:w-44 sm:flex-col"
      >
        <h1 className="hidden pb-4 text-xl font-semibold sm:block">Settings</h1>
        {[
          ["models", "Model choices"],
          ["machine", "Machine defaults"],
          ["providers", "Providers"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/settings?section=${key}`}
            aria-current={section === key ? "page" : undefined}
            className={`px-3 py-2 text-sm hover:bg-accent ${section === key ? "bg-accent" : ""}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-6">
        <div className="max-w-sm space-y-2">
          <p className="text-xs text-muted-foreground">Selected machine</p>
          <ChoiceSelect
            label="Settings machine"
            value={id}
            items={connections.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            placeholder="No machine selected"
            disabled={!connections.length}
            onChange={select}
          />
        </div>
        <div key={`${section}:${id}`}>
          {section === "models" ? (
            <ModelPreferencesSettings />
          ) : !id ? (
            <p className="text-sm text-muted-foreground">
              <Link className="underline" href="/machines">
                Connect or select a machine
              </Link>{" "}
              to configure its defaults and providers.
            </p>
          ) : section === "machine" ? (
            <MachineSettings />
          ) : (
            <ProviderSettings />
          )}
        </div>
      </div>
    </main>
  );
}
export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Loading settings…</p>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
