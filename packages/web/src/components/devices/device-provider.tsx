"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useConnection } from "@/components/connection-provider";
import {
  type Device,
  devicesStorageKey,
  newDevice,
  parseDevices,
} from "@/lib/devices";

type DevicesState = {
  devices: Device[];
  ready: boolean;
  error?: string;
  selectedId?: string;
  select: (device: Device) => void;
  add: (name: string, url: string) => Device;
  remove: (id: string) => void;
};
const Context = createContext<DevicesState | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const connection = useConnection();

  useEffect(() => {
    try {
      setDevices(parseDevices(localStorage.getItem(devicesStorageKey)));
    } catch {
      setError(
        "Saved devices could not be read. Your existing browser data has not been changed.",
      );
    }
    setReady(true);
  }, []);

  function save(next: Device[]) {
    if (!ready) throw new Error("Wait for saved devices to load.");
    if (error)
      throw new Error(
        "Saved devices could not be read. Reload after resolving browser storage access; the existing list will not be overwritten.",
      );
    localStorage.setItem(devicesStorageKey, JSON.stringify(next));
    setDevices(next);
    setError(undefined);
  }

  return (
    <Context
      value={{
        devices,
        ready,
        error,
        selectedId,
        select: (device) => {
          setSelectedId(device.id);
          void connection.connect(device.url);
        },
        add: (name, url) => {
          const device = newDevice(devices, name, url, crypto.randomUUID());
          save([...devices, device]);
          return device;
        },
        remove: (id) => {
          const device = devices.find((item) => item.id === id);
          save(devices.filter((item) => item.id !== id));
          if (selectedId === id) setSelectedId(undefined);
          if (selectedId === id || connection.origin === device?.url)
            connection.disconnect();
        },
      }}
    >
      {children}
    </Context>
  );
}

export function useDevices() {
  const state = useContext(Context);
  if (!state) throw new Error("DeviceProvider is required");
  return state;
}
