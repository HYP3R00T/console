"use client";
import { useRouter } from "next/navigation";

import { useEffect, useState } from "react";
import { useBackend } from "@/components/machines/connection-context";
import { SharedState } from "@/components/machines/shared-state";
import { ChoiceSelect } from "@/components/shared/choice-select";
import { Button } from "@/components/ui/button";
import {
  type AgentConfiguration,
  api,
  fieldClass,
  type Provider,
} from "@/lib/api";

type Settings = {
  name: string;
  projectsDirectory: string;
  defaultConfiguration: AgentConfiguration | null;
  lastConfiguration: AgentConfiguration | null;
  runtime?: { node: string; pi: string; git: boolean };
};
export function MachineSettings({ active = true }: { active?: boolean }) {
  const router = useRouter();
  const { id } = useBackend();
  const [machineStateOpen, setMachineStateOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [followLast, setFollowLast] = useState(true);
  const [config, setConfig] = useState<AgentConfiguration>({
    provider: "",
    model: "",
    thinkingLevel: "off",
  });
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!active || settings) return;
    const controller = new AbortController();
    Promise.all([
      api<Settings>("/machine-settings", "GET", undefined, controller.signal),
      api<Provider[]>(
        "/providers?connected=true",
        "GET",
        undefined,
        controller.signal,
      ),
    ])
      .then(([current, items]) => {
        setSettings(current);
        setProviders(items);
        setFollowLast(!current.defaultConfiguration);
        setConfig(
          current.defaultConfiguration ??
            current.lastConfiguration ?? {
              provider: "",
              model: "",
              thinkingLevel: "off",
            },
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [active, settings]);
  const provider = providers.find((item) => item.id === config.provider);
  const model = provider?.models.find((item) => item.id === config.model);
  return (
    <section
      className="space-y-4 rounded-xl border p-5"
      aria-label="Machine configuration"
    >
      <h2 className="font-semibold">Machine configuration</h2>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {settings && (
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setWorking(true);
            setMessage("");
            try {
              const current = await api<Settings>(
                "/machine-settings",
                "PATCH",
                {
                  name: settings.name,
                  projectsDirectory: settings.projectsDirectory,
                  defaultConfiguration: followLast ? null : config,
                },
              );
              if (id !== "local")
                await api(`/backends/${id}`, "PATCH", { name: current.name });
              setMessage("Machine settings saved.");
              window.dispatchEvent(new Event("console:backends-changed"));
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setWorking(false);
            }
          }}
        >
          <label className="space-y-2 text-sm">
            Machine name
            <input
              className={fieldClass}
              required
              maxLength={80}
              value={settings.name}
              onChange={(event) =>
                setSettings({ ...settings, name: event.target.value })
              }
            />
          </label>
          <label className="space-y-2 text-sm">
            Default project directory
            <input
              className={fieldClass}
              required
              value={settings.projectsDirectory}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  projectsDirectory: event.target.value,
                })
              }
            />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Cloned projects go here unless a destination is provided. Saving
            this changes future destinations; existing files stay in place.
          </p>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={followLast}
              onChange={(event) => setFollowLast(event.target.checked)}
            />
            Use the last selected model as the machine default
          </label>
          <div className="space-y-2 text-sm">
            <span>Default provider</span>
            <ChoiceSelect
              label="Default provider"
              value={config.provider}
              disabled={followLast}
              items={providers.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              placeholder={
                followLast
                  ? "Remember last selection"
                  : providers.length
                    ? "Select a provider"
                    : "Connect a provider first"
              }
              onChange={(value) =>
                setConfig({ provider: value, model: "", thinkingLevel: "off" })
              }
            />
          </div>
          <div className="space-y-2 text-sm">
            <span>Default model</span>
            <ChoiceSelect
              label="Default model"
              value={config.model}
              disabled={followLast || !provider}
              items={(provider?.models ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              onChange={(value) => {
                const chosen = provider?.models.find(
                  (item) => item.id === value,
                );
                setConfig({
                  ...config,
                  model: value,
                  thinkingLevel: chosen?.thinkingLevels[0] ?? "off",
                });
              }}
            />
          </div>
          <div className="space-y-2 text-sm">
            <span>Default thinking</span>
            <ChoiceSelect
              label="Default thinking"
              value={config.thinkingLevel}
              disabled={followLast || !model}
              items={(model?.thinkingLevels ?? ["off"]).map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) =>
                setConfig({ ...config, thinkingLevel: value })
              }
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
            A project starts with its last model, then the machine default.
            Additional conversations initially inherit the project's first
            conversation settings.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                router.push("/settings?section=providers");
              }}
            >
              Manage providers for this machine
            </button>
            .
          </p>
          <Button type="submit" disabled={working || (!followLast && !model)}>
            {working ? "Saving…" : "Save machine settings"}
          </Button>
          <p className="border-t pt-3 text-xs text-muted-foreground sm:col-span-2">
            Node {settings.runtime?.node ?? "available"} · Pi Durable{" "}
            {settings.runtime?.pi ?? "included in machine service"} · Git{" "}
            {settings.runtime?.git ? "available" : "unavailable"}. Pi is part of
            the Console service; it does not need a separate install.
          </p>
        </form>
      )}
      <details
        className="rounded-xl border p-4"
        onToggle={(event) => setMachineStateOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium">
          Advanced machine data
        </summary>
        <div className="pt-4">
          <SharedState active={active && machineStateOpen} />
        </div>
      </details>
    </section>
  );
}
