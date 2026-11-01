"use client";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDevices } from "@/components/devices/device-provider";
import { useBackendRequest } from "@/hooks/use-backend-request";

export type Project = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  icon: string;
  color: string;
  available: boolean;
  unavailableReason?: string;
};
export type MachineSettings = {
  projectsRoot: string;
  available: boolean;
  unavailableReason?: string;
};
type State = ReturnType<typeof useBackendRequest> & {
  settings?: MachineSettings;
  projects?: Project[];
  error?: string;
  refresh: () => Promise<void>;
};
const Context = createContext<State | null>(null);
export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { origin, request } = useBackendRequest();
  const latest = useRef(origin);
  latest.current = origin;
  const version = useRef(0);
  const [snapshot, setSnapshot] = useState<{
    origin: string;
    settings?: MachineSettings;
    projects?: Project[];
    error?: string;
  }>();
  const refresh = useCallback(async () => {
    if (!origin) return;
    const current = ++version.current;
    try {
      const [data, settings] = await Promise.all([
        request<{ projects: Project[] }>("/v1/projects"),
        request<MachineSettings>("/v1/machine/settings"),
      ]);
      if (
        !Array.isArray(data.projects) ||
        typeof settings.projectsRoot !== "string"
      )
        throw new Error("Invalid project response.");
      if (latest.current === origin && version.current === current)
        setSnapshot({ origin, projects: data.projects, settings });
    } catch (cause) {
      if (latest.current === origin && version.current === current)
        setSnapshot({
          origin,
          error:
            cause instanceof Error ? cause.message : "Could not load projects.",
        });
    }
  }, [origin, request]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      clearInterval(timer);
      ++version.current;
    };
  }, [refresh]);
  const current = snapshot?.origin === origin ? snapshot : undefined;
  return (
    <Context
      value={{
        origin,
        request,
        refresh,
        projects: current?.projects,
        settings: current?.settings,
        error: current?.error,
      }}
    >
      {children}
    </Context>
  );
}
export function useMachineProjects(deviceId: string) {
  const state = useContext(Context);
  if (!state) throw new Error("ProjectsProvider is required");
  const { devices } = useDevices();
  const device = devices.find((d) => d.id === deviceId);
  const connected = !!device && state.origin === device.url;
  return {
    ...state,
    connected,
    device,
    projects: connected ? state.projects : undefined,
    settings: connected ? state.settings : undefined,
    error: connected ? state.error : undefined,
  };
}
