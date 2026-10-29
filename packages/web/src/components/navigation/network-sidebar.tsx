"use client";

import { useBackend } from "@/components/machines/connection-context";

import { MachineBranch } from "./machine-branch";

export function NetworkSidebar({
  selected,
  creating,
  conversationId,
  onSelect,
  onNew,
}: {
  selected: string;
  creating?: boolean;
  conversationId?: string;
  onSelect: (sessionId: string, conversationId?: string) => void;
  onNew: (projectId: string) => void;
}) {
  const { connections, id } = useBackend();
  return (
    <nav aria-label="Machine network" className="relative p-2">
      {connections.map((machine) => (
        <MachineBranch
          key={machine.id}
          machine={machine}
          active={machine.id === id}
          selected={selected}
          creating={creating}
          conversationId={conversationId}
          onSelect={onSelect}
          onNew={onNew}
        />
      ))}
    </nav>
  );
}
