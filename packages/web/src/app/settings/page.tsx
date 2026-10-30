"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useBackend } from "@/components/machines/connection-context";
import { MachineSettings } from "@/components/machines/settings";
import { MachineSwitcher } from "@/components/machines/switcher";
import { ModelPreferencesSettings } from "@/components/models/preferences";
import ProviderSettings from "@/components/models/provider-settings";

function SettingsContent() {
  const params = useSearchParams();
  const section = ["machine", "providers"].includes(params.get("section") ?? "")
    ? params.get("section")
    : "models";
  const { id, connections } = useBackend();
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-5 sm:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Workspace settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose a machine, then manage its providers, model catalog and
          defaults.
        </p>
      </header>
      <MachineSwitcher />
      {id ? (
        <div
          key={id}
          className="overflow-hidden rounded-2xl border border-border/70 bg-card/30"
        >
          <header className="border-b px-5 pt-4">
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              {connections.find((machine) => machine.id === id)?.name}{" "}
              configuration
            </p>
            <nav
              aria-label="Settings sections"
              className="flex gap-1 overflow-auto"
            >
              {[
                ["models", "Model menu"],
                ["providers", "Providers"],
                ["machine", "Machine defaults"],
              ].map(([key, label]) => (
                <Link
                  key={key}
                  href={`/settings?section=${key}`}
                  aria-current={section === key ? "page" : undefined}
                  className={`shrink-0 border-b-2 px-3 py-3 text-xs font-medium ${section === key ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </header>
          <div className="p-5 sm:p-6">
            <div hidden={section !== "models"}>
              <ModelPreferencesSettings active={section === "models"} />
            </div>
            <div hidden={section !== "providers"}>
              <ProviderSettings active={section === "providers"} />
            </div>
            <div hidden={section !== "machine"}>
              <MachineSettings active={section === "machine"} />
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border p-5 text-sm text-muted-foreground">
          Select a saved machine above or add a connection to configure it.
        </p>
      )}
    </main>
  );
}
export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Opening settings…</p>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
