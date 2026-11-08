import { type ImportedTheme, parseTheme } from "./theme-schema.ts";

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
