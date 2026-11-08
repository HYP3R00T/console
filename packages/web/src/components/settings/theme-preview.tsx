import type { ImportedTheme } from "@/lib/configuration/store";
import { themeColorGroups } from "@/lib/configuration/theme-gallery";

export function ThemePreview({ theme }: { theme: ImportedTheme }) {
  return (
    <span className="flex w-full flex-col gap-2">
      {themeColorGroups(theme).map((group) => (
        <span key={group.name} className="flex w-full items-center gap-3">
          <span className="w-20 shrink-0 text-left text-xs text-muted-foreground">
            {group.name}
          </span>
          <span className="flex h-5 min-w-0 flex-1 gap-1">
            {group.colors.map((color) => (
              <span
                key={color.hex}
                role="img"
                title={`${color.roles.join(", ")}: ${color.hex}`}
                aria-label={`${color.roles.join(", ")}: ${color.hex}`}
                className="min-w-0 flex-1 rounded border border-foreground/15"
                style={{ background: color.hex }}
              />
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
