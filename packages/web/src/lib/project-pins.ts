import { backendOrigin } from "./connection.ts";

export type ProjectPins = Record<string, string[]>;
export const projectPinsStorageKey = "console.project-pins.v1";
export function parseProjectPins(value: string | null): ProjectPins {
  if (!value) return {};
  const data: unknown = JSON.parse(value);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Invalid project pins.");
  const result: ProjectPins = {};
  for (const [origin, ids] of Object.entries(data)) {
    if (
      backendOrigin(origin) !== origin ||
      !Array.isArray(ids) ||
      ids.some((id) => typeof id !== "string" || !id) ||
      new Set(ids).size !== ids.length
    )
      throw new Error("Invalid project pins.");
    result[origin] = ids;
  }
  return result;
}
export function updateProjectPins(
  pins: ProjectPins,
  origin: string,
  id: string,
  pinned: boolean,
): ProjectPins {
  const others = (pins[origin] ?? []).filter((value) => value !== id);
  return { ...pins, [origin]: pinned ? [id, ...others] : others };
}
export function orderPinnedProjects<T extends { id: string }>(
  projects: T[],
  pinned: string[],
): T[] {
  const positions = new Map(pinned.map((id, index) => [id, index]));
  return [...projects].sort(
    (a, b) =>
      (positions.get(a.id) ?? pinned.length) -
      (positions.get(b.id) ?? pinned.length),
  );
}
