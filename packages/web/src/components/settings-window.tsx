"use client";
import { XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ProviderSettings from "@/app/settings/providers/page";
import { useBackend } from "@/components/connection-context";
import { MachineSettings } from "@/components/machine-settings";
import { ModelPreferencesSettings } from "@/components/model-preferences";
import { Button } from "@/components/ui/button";
export function SettingsWindow({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState("models");
  const { id, connections } = useBackend();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    const show = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      setSection(
        ["models", "machine", "providers"].includes(next) ? next : "models",
      );
    };
    window.addEventListener("console:settings-section", show);
    return () => window.removeEventListener("console:settings-section", show);
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
      aria-label="Settings"
      className="fixed inset-0 m-auto h-[85svh] w-[min(1100px,95vw)] max-w-none border bg-background p-0 text-foreground backdrop:bg-black/60"
    >
      <div className="flex h-full">
        <aside className="flex w-44 shrink-0 flex-col gap-1 border-r bg-sidebar p-3">
          <h1 className="mb-4 p-2 font-semibold">Settings</h1>
          {[
            ["models", "Model choices"],
            ["machine", "Machine"],
            ["providers", "Providers"],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              disabled={!id && ["machine", "providers"].includes(key)}
              aria-current={section === key ? "page" : undefined}
              className={`px-3 py-2 text-left text-sm disabled:opacity-40 ${section === key ? "bg-accent" : "hover:bg-accent"}`}
              onClick={() => setSection(key)}
            >
              {label}
            </button>
          ))}
          <p className="mt-auto text-xs text-muted-foreground">
            {connections.find((item) => item.id === id)?.name ??
              "No machine selected"}
          </p>
        </aside>
        <main className="relative min-w-0 flex-1 overflow-auto p-6 pt-12">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Close settings"
            className="absolute top-2 right-2"
            onClick={onClose}
          >
            <XIcon />
          </Button>
          {open && (
            <div key={`${section}:${id}`}>
              {section === "models" ? (
                <ModelPreferencesSettings />
              ) : !id ? (
                <p>Choose a connected machine on the Machines page.</p>
              ) : section === "machine" ? (
                <MachineSettings />
              ) : (
                <ProviderSettings />
              )}
            </div>
          )}
        </main>
      </div>
    </dialog>
  );
}
