/** Pins are shortcuts to existing items, never duplicate entries or invented records. */
export function splitPinnedItems<T>(
  items: T[],
  key: (item: T) => string,
  pins: string[],
): { pinned: T[]; regular: T[] } {
  const positions = new Map(pins.map((id, index) => [id, index]));
  return {
    pinned: items
      .filter((item) => positions.has(key(item)))
      .sort(
        (a, b) =>
          (positions.get(key(a)) ?? pins.length) -
          (positions.get(key(b)) ?? pins.length),
      ),
    regular: items.filter((item) => !positions.has(key(item))),
  };
}
