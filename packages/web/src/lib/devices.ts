import { backendOrigin } from "./connection.ts";

export type Device = {
  id: string;
  name: string;
  url: string;
  backendId?: string;
};
export const devicesStorageKey = "console.devices.v1";
export const connectedDevicesKey = "console.connected-devices.v2";
export const legacyConnectedDeviceKey = "console.connected-device.v1";

export function parseConnectedDevices(
  value: string | null,
  legacy: string | null,
  devices: Device[],
): string[] {
  const ids: unknown =
    value === null ? (legacy ? [legacy] : []) : JSON.parse(value);
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string"))
    throw new Error("Invalid remembered connections");
  return [
    ...new Set(ids.filter((id) => devices.some((device) => device.id === id))),
  ];
}

export function parseDevices(value: string | null): Device[] {
  if (!value) return [];
  const data: unknown = JSON.parse(value);
  if (!Array.isArray(data)) throw new Error("Invalid saved device list");
  const devices: Device[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const item of data) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !item.id ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 80 ||
      typeof item.url !== "string"
    )
      throw new Error("Invalid saved device record");
    const url = backendOrigin(item.url);
    if (ids.has(item.id) || urls.has(url))
      throw new Error("Duplicate saved device");
    ids.add(item.id);
    urls.add(url);
    if (
      "backendId" in item &&
      (typeof item.backendId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(item.backendId))
    )
      throw new Error("Invalid backend identity");
    devices.push({
      id: item.id,
      name: item.name.trim(),
      url,
      ...("backendId" in item ? { backendId: item.backendId as string } : {}),
    });
  }
  return devices;
}

export function newDevice(
  devices: Device[],
  name: string,
  address: string,
  id: string,
): Device {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80)
    throw new Error("Use a device name between 1 and 80 characters.");
  const url = backendOrigin(address);
  if (devices.some((device) => device.url === url))
    throw new Error("A device with this backend URL is already saved.");
  return { id, name: trimmed, url };
}
