"use client";
import { MonitorIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useBackend } from "@/components/machines/connection-context";
export function MachineSwitcher() {
  const { connections, id, select } = useBackend();
  return (
    <nav aria-label="Settings machine" className="flex flex-wrap gap-3">
      {connections.map((machine) => (
        <button
          key={machine.id}
          type="button"
          aria-pressed={machine.id === id}
          onClick={() => {
            if (machine.id !== id) select(machine.id);
          }}
          className={`flex w-56 max-w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-accent/50 ${machine.id === id ? "border-ring/60 bg-accent/40" : "border-border/70"}`}
        >
          <MonitorIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {machine.name}
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className={`size-1.5 rounded-full ${machine.status === "online" ? "bg-emerald-500" : "bg-muted-foreground"}`}
              />
              {machine.status}
              {machine.id === id ? " · selected" : ""}
            </span>
          </span>
        </button>
      ))}
      <Link
        href="/machines"
        className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-xs text-muted-foreground hover:bg-accent"
      >
        <PlusIcon className="size-4" />
        Add machine
      </Link>
    </nav>
  );
}
