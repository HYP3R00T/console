import {
  exact,
  type ImportedTheme,
  object,
  parseTheme,
} from "./theme-schema.ts";
import {
  type Appearance,
  appearanceKey,
  migrateAppearance,
  parseAppearance,
  readAppearance,
} from "./themes.ts";

export { type ImportedTheme, parseTheme, themeTokens } from "./theme-schema.ts";

import {
  commandIds,
  parseShortcuts,
  type ShortcutOverrides,
} from "../commands.ts";
import { parseConversationPins } from "../conversation-pins.ts";
import { parseDevices } from "../devices.ts";
import { parseNavigationMemory } from "../navigation-memory.ts";
import { parseProjectPins } from "../project-pins.ts";

export const configurationKey = "console.configuration.v1";
export const configurationEvent = "console:configuration";
export const preferenceKeys = [
  "theme",
  appearanceKey,
  "console.shortcuts.v1",
  "console.devices.v1",
  "console.project-pins.v1",
  "console.conversation-pins.v1",
  "console.navigation.v1",
  "console.themes.v1",
] as const;
const internalKeys = [
  ...preferenceKeys,
  "console.import-id",
  "console.connected-devices.v2",
  "console.connected-device.v1",
];
type Values = Record<string, string>;
export type ConfigurationBackup = {
  version: 2;
  settings: {
    appearance: Appearance;
    bookmarks: ReturnType<typeof parseDevices>;
    projectPins: ReturnType<typeof parseProjectPins>;
    conversationPins: ReturnType<typeof parseConversationPins>;
    navigation: ReturnType<typeof parseNavigationMemory>;
  };
  keybindings: ShortcutOverrides;
  themes: ImportedTheme[];
};
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
export function parseBackup(value: unknown): ConfigurationBackup {
  const data = object(value);
  exact(data, ["version", "settings", "keybindings", "themes"]);
  if (data.version !== 1 && data.version !== 2)
    throw new Error("Unsupported configuration version.");
  const settings = object(data.settings);
  exact(settings, [
    data.version === 1 ? "theme" : "appearance",
    "bookmarks",
    "projectPins",
    "conversationPins",
    "navigation",
  ]);
  const bindings = object(data.keybindings);
  if (
    Object.keys(bindings).some(
      (key) => !commandIds.includes(key as (typeof commandIds)[number]),
    )
  )
    throw new Error("Unknown command ID in keybindings.");
  const keybindings = parseShortcuts(JSON.stringify(bindings));
  if (
    JSON.stringify(Object.entries(keybindings).sort()) !==
    JSON.stringify(Object.entries(bindings).sort())
  )
    throw new Error("Invalid or conflicting keyboard shortcuts.");
  if (!Array.isArray(data.themes) || data.themes.length > 100)
    throw new Error("Invalid theme collection.");
  const themes = data.themes.map(parseTheme);
  if (new Set(themes.map((theme) => theme.id)).size !== themes.length)
    throw new Error("Duplicate theme IDs.");
  const appearance =
    data.version === 1
      ? migrateAppearance(
          typeof settings.theme === "string" ? settings.theme : "",
          themes,
        )
      : parseAppearance(settings.appearance, themes);
  // Bookmark identity is deliberately discarded: imported addresses are not trusted installations.
  const bookmarks = parseDevices(JSON.stringify(settings.bookmarks)).map(
    ({ backendId: _identity, ...bookmark }) => bookmark,
  );
  const navigation = object(settings.navigation);
  exact(navigation, [
    "routes",
    "disclosures",
    ...(Object.hasOwn(navigation, "inspectors") ? ["inspectors"] : []),
  ]);
  const parsedNavigation = parseNavigationMemory(JSON.stringify(navigation));
  if (stable(parsedNavigation) !== stable(navigation))
    throw new Error("Invalid navigation preferences.");
  return {
    version: 2,
    settings: {
      appearance,
      bookmarks,
      projectPins: parseProjectPins(JSON.stringify(settings.projectPins)),
      conversationPins: parseConversationPins(
        JSON.stringify(settings.conversationPins),
      ),
      navigation: parsedNavigation,
    },
    keybindings,
    themes,
  };
}
/** Single-key commits make replacing a configuration atomic even when browser storage fails. */
export class ConfigurationStore {
  private previous?: Values;
  private storage: Pick<Storage, "getItem" | "setItem">;
  private changed: (imported: boolean) => void;
  constructor(
    storage: Pick<Storage, "getItem" | "setItem">,
    changed: (imported: boolean) => void = () => {},
  ) {
    this.storage = storage;
    this.changed = changed;
  }
  private values(): Values {
    const saved = this.storage.getItem(configurationKey);
    if (saved) {
      const envelope = object(JSON.parse(saved));
      if (envelope.version !== 1)
        throw new Error("Unsupported browser configuration version.");
      const values = object(envelope.values);
      if (
        Object.entries(values).some(
          ([key, value]) =>
            !internalKeys.includes(key as (typeof internalKeys)[number]) ||
            typeof value !== "string",
        )
      )
        throw new Error("Invalid browser configuration.");
      return { ...values } as Values;
    }
    return Object.fromEntries(
      internalKeys.flatMap((key) => {
        const value = this.storage.getItem(key);
        return value === null ? [] : [[key, value]];
      }),
    );
  }
  getItem(key: string) {
    return this.values()[key] ?? null;
  }
  setItem(key: string, value: string) {
    if (!internalKeys.includes(key as (typeof internalKeys)[number]))
      throw new Error("Unknown client preference.");
    this.commit({ ...this.values(), [key]: value });
  }
  removeItem(key: string) {
    const values = this.values();
    delete values[key];
    this.commit(values);
  }
  private commit(values: Values, imported = false) {
    this.storage.setItem(
      configurationKey,
      JSON.stringify({ version: 1, values }),
    );
    this.changed(imported);
  }
  appearance(): Appearance {
    return readAppearance(
      this.getItem(appearanceKey),
      this.getItem("theme"),
      this.themes(),
    );
  }
  themes(): ImportedTheme[] {
    const themes: unknown = JSON.parse(
      this.getItem("console.themes.v1") ?? "[]",
    );
    if (!Array.isArray(themes) || themes.length > 100)
      throw new Error("Invalid theme collection.");
    return themes.map(parseTheme);
  }
  saveAppearance(value: Appearance) {
    const appearance = parseAppearance(value, this.themes());
    this.setItem(appearanceKey, JSON.stringify(appearance));
  }
  importTheme(value: unknown) {
    const theme = parseTheme(value);
    const current = this.themes();
    if (current.length >= 100 && !current.some((item) => item.id === theme.id))
      throw new Error("At most 100 imported themes are supported.");
    const next = [...current.filter((item) => item.id !== theme.id), theme];
    parseAppearance(this.appearance(), next);
    this.setItem("console.themes.v1", JSON.stringify(next));
    return theme;
  }
  export(): ConfigurationBackup {
    const v = this.values();
    return parseBackup({
      version: 2,
      settings: {
        appearance: readAppearance(
          v[appearanceKey] ?? null,
          v.theme ?? null,
          JSON.parse(v["console.themes.v1"] ?? "[]").map(parseTheme),
        ),
        bookmarks: parseDevices(v["console.devices.v1"] ?? null),
        projectPins: parseProjectPins(v["console.project-pins.v1"] ?? null),
        conversationPins: parseConversationPins(
          v["console.conversation-pins.v1"] ?? null,
        ),
        navigation: parseNavigationMemory(v["console.navigation.v1"] ?? null),
      },
      keybindings: parseShortcuts(v["console.shortcuts.v1"] ?? null),
      themes: JSON.parse(v["console.themes.v1"] ?? "[]"),
    });
  }
  import(value: unknown) {
    const data = parseBackup(value),
      previous = this.values();
    this.commit(
      {
        [appearanceKey]: JSON.stringify(data.settings.appearance),
        "console.shortcuts.v1": JSON.stringify(data.keybindings),
        "console.devices.v1": JSON.stringify(data.settings.bookmarks),
        "console.project-pins.v1": JSON.stringify(data.settings.projectPins),
        "console.conversation-pins.v1": JSON.stringify(
          data.settings.conversationPins,
        ),
        "console.navigation.v1": JSON.stringify(data.settings.navigation),
        "console.themes.v1": JSON.stringify(data.themes),
        "console.connected-devices.v2": "[]",
        "console.import-id": crypto.randomUUID(),
      },
      true,
    );
    this.previous = previous;
  }
  undo() {
    if (!this.previous) throw new Error("No configuration import to undo.");
    const previous = this.previous;
    this.commit(
      {
        ...previous,
        "console.connected-devices.v2": "[]",
        "console.connected-device.v1": "",
        "console.import-id": crypto.randomUUID(),
      },
      true,
    );
    this.previous = undefined;
  }
}
let instance: ConfigurationStore | undefined;
export function clientConfiguration() {
  instance ??= new ConfigurationStore(window.localStorage, (imported) =>
    window.dispatchEvent(
      new CustomEvent(configurationEvent, { detail: { imported } }),
    ),
  );
  return instance;
}
export function subscribeConfiguration(listener: (imported: boolean) => void) {
  const local = (event: Event) =>
    listener(!!(event as CustomEvent).detail?.imported);
  const external = (event: StorageEvent) => {
    if (event.key === null) {
      listener(true);
      return;
    }
    if (event.key !== configurationKey) return;
    try {
      const before = JSON.parse(event.oldValue ?? "{}").values?.[
        "console.import-id"
      ];
      const after = JSON.parse(event.newValue ?? "{}").values?.[
        "console.import-id"
      ];
      listener(before !== after);
    } catch {
      listener(false);
    }
  };
  window.addEventListener(configurationEvent, local);
  window.addEventListener("storage", external);
  return () => {
    window.removeEventListener(configurationEvent, local);
    window.removeEventListener("storage", external);
  };
}
