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

const selectedDeviceKey = "console.connected-device.v1";

type DevicesState = {
  devices: Device[];
  ready: boolean;
  error?: string;
  selectedId?: string;
  select: (device: Device) => void;
  disconnect: () => void;
  add: (name: string, url: string) => Device;
  remove: (id: string) => void;
};
const Context = createContext<DevicesState | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const { connect, disconnect: disconnectBackend, origin } = useConnection();

  useEffect(() => {
    try {
      const saved = parseDevices(localStorage.getItem(devicesStorageKey));
      setDevices(saved);
      const remembered = localStorage.getItem(selectedDeviceKey);
      const device = saved.find((item) => item.id === remembered);
      if (device) {
        setSelectedId(device.id);
        void connect(device.url);
      }
    } catch {
      setError(
        "Saved devices could not be read. Your existing browser data has not been changed.",
      );
    }
    setReady(true);
  }, [connect]);

  function remember(id?: string) {
    try {
      if (id) localStorage.setItem(selectedDeviceKey, id);
      else localStorage.removeItem(selectedDeviceKey);
    } catch {
      // Keep connection controls usable when browser storage is unavailable.
    }
  }

  function disconnect() {
    remember();
    setSelectedId(undefined);
    disconnectBackend();
  }

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
          remember(device.id);
          void connect(device.url);
        },
        disconnect,
        add: (name, url) => {
          const device = newDevice(devices, name, url, crypto.randomUUID());
          save([...devices, device]);
          return device;
        },
        remove: (id) => {
          const device = devices.find((item) => item.id === id);
          save(devices.filter((item) => item.id !== id));
          if (selectedId === id || (device && origin === device.url))
            disconnect();
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
