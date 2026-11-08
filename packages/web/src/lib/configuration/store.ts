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
export const themeTokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;
export type ImportedTheme = {
  id: string;
  name: string;
  mode: "light" | "dark";
  tokens: Partial<Record<(typeof themeTokens)[number], string>>;
};
export const preferenceKeys = [
  "theme",
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
  version: 1;
  settings: {
    theme: string;
    bookmarks: ReturnType<typeof parseDevices>;
    projectPins: ReturnType<typeof parseProjectPins>;
    conversationPins: ReturnType<typeof parseConversationPins>;
    navigation: ReturnType<typeof parseNavigationMemory>;
  };
  keybindings: ShortcutOverrides;
  themes: ImportedTheme[];
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a configuration object.");
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error("Unexpected or missing configuration fields.");
}
export function parseTheme(value: unknown): ImportedTheme {
  const theme = object(value);
  exact(theme, ["id", "name", "mode", "tokens"]);
  if (
    typeof theme.id !== "string" ||
    !/^custom-[a-z0-9-]{1,50}$/.test(theme.id) ||
    typeof theme.name !== "string" ||
    !theme.name.trim() ||
    theme.name.length > 80 ||
    !["light", "dark"].includes(String(theme.mode))
  )
    throw new Error("Invalid theme identity, name or mode.");
  const tokens = object(theme.tokens);
  if (
    !Object.keys(tokens).length ||
    Object.entries(tokens).some(
      ([key, value]) =>
        !themeTokens.includes(key as (typeof themeTokens)[number]) ||
        typeof value !== "string" ||
        !/^#[\da-f]{6}$/i.test(value),
    )
  )
    throw new Error(
      "Theme tokens must use supported names and six-digit hex colors.",
    );
  return {
    id: theme.id,
    name: theme.name,
    mode: theme.mode as ImportedTheme["mode"],
    tokens: { ...tokens },
  } as ImportedTheme;
}
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
  if (data.version !== 1) throw new Error("Unsupported configuration version.");
  const settings = object(data.settings);
  exact(settings, [
    "theme",
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
  if (
    typeof settings.theme !== "string" ||
    !["system", "light", "dark", ...themes.map((theme) => theme.id)].includes(
      settings.theme,
    )
  )
    throw new Error("Unknown selected theme.");
  // Bookmark identity is deliberately discarded: imported addresses are not trusted installations.
  const bookmarks = parseDevices(JSON.stringify(settings.bookmarks)).map(
    ({ backendId: _identity, ...bookmark }) => bookmark,
  );
  const navigation = object(settings.navigation);
  exact(navigation, ["routes", "disclosures"]);
  const parsedNavigation = parseNavigationMemory(JSON.stringify(navigation));
  if (stable(parsedNavigation) !== stable(navigation))
    throw new Error("Invalid navigation preferences.");
  return {
    version: 1,
    settings: {
      theme: settings.theme,
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
  export(): ConfigurationBackup {
    const v = this.values();
    return parseBackup({
      version: 1,
      settings: {
        theme: v.theme ?? "system",
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
        theme: data.settings.theme,
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
