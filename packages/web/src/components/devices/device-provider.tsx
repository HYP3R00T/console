"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useConnections } from "@/components/connection-provider";
import {
  connectedDevicesKey,
  type Device,
  type DeviceAppearance,
  devicesStorageKey,
  legacyConnectedDeviceKey,
  newDevice,
  parseConnectedDevices,
  parseDevices,
} from "@/lib/devices";

type DevicesState = {
  devices: Device[];
  ready: boolean;
  error?: string;
  connect: (device: Device) => void;
  disconnect: (id: string) => void;
  add: (name: string, url: string) => Device;
  edit: (
    id: string,
    name: string,
    url: string,
    appearance?: DeviceAppearance,
  ) => void;
  remove: (id: string) => void;
};
const Context = createContext<DevicesState | null>(null);
export function DeviceProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const { manager, states } = useConnections();
  const remembered = useRef(new Set<string>());
  useEffect(() => {
    try {
      const saved = parseDevices(localStorage.getItem(devicesStorageKey));
      setDevices(saved);
      remembered.current = new Set(
        parseConnectedDevices(
          localStorage.getItem(connectedDevicesKey),
          localStorage.getItem(legacyConnectedDeviceKey),
          saved,
        ),
      );
      for (const device of saved)
        if (remembered.current.has(device.id))
          void manager.connect(device.id, device.url, device.backendId);
    } catch {
      setError(
        "Saved devices could not be read. Your existing browser data has not been changed.",
      );
    }
    setReady(true);
  }, [manager]);
  useEffect(() => {
    if (!ready || error) return;
    const next = devices.map((device) => {
      const identity = states[device.id]?.backendId;
      return identity && device.backendId !== identity
        ? { ...device, backendId: identity }
        : device;
    });
    if (next.some((device, index) => device !== devices[index])) {
      try {
        localStorage.setItem(devicesStorageKey, JSON.stringify(next));
        setDevices(next);
      } catch {
        setError("Backend identity could not be saved in this browser.");
      }
    }
  }, [states, devices, ready, error]);
  function remember() {
    try {
      localStorage.setItem(
        connectedDevicesKey,
        JSON.stringify([...remembered.current]),
      );
      localStorage.removeItem(legacyConnectedDeviceKey);
    } catch {
      setError("Connection choices could not be saved in this browser.");
    }
  }
  function disconnect(id: string) {
    remembered.current.delete(id);
    remember();
    manager.disconnect(id);
  }
  function save(next: Device[]) {
    if (!ready || error)
      throw new Error(
        "Resolve saved-device storage access before editing the list.",
      );
    localStorage.setItem(devicesStorageKey, JSON.stringify(next));
    setDevices(next);
  }
  return (
    <Context
      value={{
        devices,
        ready,
        error,
        connect: (device) => {
          void manager
            .connect(device.id, device.url, device.backendId)
            .then((connected) => {
              if (
                connected &&
                manager.snapshot()[device.id]?.status === "connected"
              ) {
                remembered.current.add(device.id);
                remember();
              }
            });
        },
        disconnect,
        add: (name, url) => {
          const device = newDevice(devices, name, url, crypto.randomUUID());
          save([...devices, device]);
          return device;
        },
        edit: (id, name, url, appearance) => {
          const previous = devices.find((device) => device.id === id);
          if (!previous) throw new Error("Device not found.");
          const replacement = newDevice(
            devices.filter((device) => device.id !== id),
            name,
            url,
            id,
          );
          save(
            devices.map((device) =>
              device.id === id
                ? {
                    ...replacement,
                    icon: appearance?.icon ?? previous.icon,
                    color: appearance?.color ?? previous.color,
                  }
                : device,
            ),
          );
          disconnect(id);
        },
        remove: (id) => {
          save(devices.filter((device) => device.id !== id));
          disconnect(id);
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
