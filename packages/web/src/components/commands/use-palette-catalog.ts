"use client";
import { useEffect, useRef, useState } from "react";
import { useConnections } from "@/components/connection-provider";
import { useDevices } from "@/components/devices/device-provider";
import {
  clientConfiguration,
  subscribeConfiguration,
} from "@/lib/configuration/store";
import {
  conversationKey,
  conversationPinsKey,
  parseConversationPins,
} from "@/lib/conversation-pins";
import { loadPaletteCatalog, type PaletteCatalog } from "@/lib/palette-catalog";
import type { PaletteDestination } from "@/lib/palette-navigation";
import {
  type ProjectPins,
  parseProjectPins,
  projectPinsStorageKey,
} from "@/lib/project-pins";

export function usePaletteCatalog(open: boolean) {
  const { devices } = useDevices();
  const { states } = useConnections();
  const candidates = devices.flatMap((device) => {
    const client = states[device.id]?.client;
    return client ? [{ device, client }] : [];
  });
  const stable = useRef(candidates);
  if (
    candidates.length !== stable.current.length ||
    candidates.some(
      (item, i) =>
        item.device.id !== stable.current[i]?.device.id ||
        item.device.name !== stable.current[i]?.device.name ||
        item.device.url !== stable.current[i]?.device.url ||
        item.client !== stable.current[i]?.client,
    )
  )
    stable.current = candidates;
  const connections = stable.current;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    connections: typeof connections;
    catalogs: Record<string, PaletteCatalog>;
    pending: number;
  }>();
  const [pins, setPins] = useState<{
    projects: ProjectPins;
    conversations: ProjectPins;
  }>({ projects: {}, conversations: {} });
  const [pinError, setPinError] = useState<string>();
  useEffect(() => {
    const read = () => {
      try {
        setPins({
          projects: parseProjectPins(
            clientConfiguration().getItem(projectPinsStorageKey),
          ),
          conversations: parseConversationPins(
            clientConfiguration().getItem(conversationPinsKey),
          ),
        });
        setPinError(undefined);
      } catch {
        setPinError("Could not read pinned destinations.");
      }
    };
    read();
    return subscribeConfiguration(read);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly refreshes the same connection catalog.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setResult({ connections, catalogs: {}, pending: connections.length });
    for (const { device, client } of connections) {
      void loadPaletteCatalog(device, client, controller.signal)
        .catch((error) => ({
          destinations: [],
          more: false,
          errors: [
            error instanceof Error
              ? error.message
              : "Could not load destinations.",
          ],
        }))
        .then((catalog) => {
          if (controller.signal.aborted) return;
          setResult((current) => ({
            connections,
            catalogs: {
              ...(current?.connections === connections ? current.catalogs : {}),
              [device.id]: catalog,
            },
            pending: Math.max(
              0,
              (current?.connections === connections
                ? current.pending
                : connections.length) - 1,
            ),
          }));
        });
    }
    return () => controller.abort();
  }, [connections, open, attempt]);
  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener("console:sessions-changed", refresh);
    return () =>
      window.removeEventListener("console:sessions-changed", refresh);
  }, []);
  const current = result?.connections === connections ? result : undefined;
  const destinations: PaletteDestination[] = devices.map((device) => ({
    id: `machine:${device.id}`,
    kind: "machine",
    label: device.name,
    description: `${device.url} · ${states[device.id]?.status ?? "disconnected"}`,
    target: { deviceId: device.id },
    path: [device.name],
    href: `/devices/${encodeURIComponent(device.id)}`,
  }));
  for (const { device, client } of connections) {
    for (const item of current?.catalogs[device.id]?.destinations ?? [])
      destinations.push({
        ...item,
        pinned:
          item.kind === "project"
            ? pins.projects[client.origin]?.includes(
                item.target.projectId ?? "",
              )
            : item.kind === "conversation"
              ? pins.conversations[client.origin]?.includes(
                  conversationKey(
                    item.target.sessionId ?? "",
                    Number(item.target.conversationId),
                  ),
                )
              : false,
      });
  }
  return {
    destinations,
    loading: open && (!current || current.pending > 0),
    errors: [
      ...(pinError ? [pinError] : []),
      ...connections.flatMap(({ device }) =>
        (current?.catalogs[device.id]?.errors ?? []).map(
          (error) => `${device.name}: ${error}`,
        ),
      ),
    ],
    more: Object.values(current?.catalogs ?? {}).some(
      (catalog) => catalog.more,
    ),
    retry: () => setAttempt((value) => value + 1),
  };
}
