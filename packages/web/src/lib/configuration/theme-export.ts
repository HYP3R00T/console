import { type ImportedTheme, parseTheme, themeTokens } from "./store.ts";

/** Export effective colors, including inherited tokens, in the same format accepted by import. */
export function currentThemeDocument(
  root: HTMLElement,
  theme?: ImportedTheme,
): ImportedTheme {
  const canvas = root.ownerDocument.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Theme export is unavailable in this browser.");
  const style = getComputedStyle(root);
  const tokens: Record<string, string> = {};
  for (const token of themeTokens) {
    const color = style.getPropertyValue(`--${token}`).trim();
    if (!color) throw new Error(`Theme color is missing: ${token}.`);
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    if (alpha !== 255)
      throw new Error(`Theme color must be opaque to export: ${token}.`);
    tokens[token] =
      `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  const mode = root.classList.contains("dark") ? "dark" : "light";
  return parseTheme({
    id: theme?.id ?? "custom-exported-theme",
    name: theme?.name ?? `Console ${mode === "dark" ? "Dark" : "Light"}`,
    mode,
    tokens,
  });
}
export function downloadTheme(theme: ImportedTheme) {
  const validated = parseTheme(theme);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(validated, null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${validated.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
