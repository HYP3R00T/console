"use client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ImportedTheme } from "@/lib/configuration/store";
import { themeTokens } from "@/lib/configuration/store";
import { downloadTheme } from "@/lib/configuration/theme-export";
import { themeTokenGroups } from "@/lib/configuration/theme-gallery";
import { completeTheme, themeDocument } from "@/lib/configuration/themes";

export function ThemeColorsDialog({
  theme,
  onClose,
}: {
  theme: ImportedTheme | undefined;
  onClose: () => void;
}) {
  if (!theme) return null;
  const { tokens } = completeTheme(theme);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{theme.name} colors</DialogTitle>
          <DialogDescription>
            All {themeTokens.length} color roles in this theme’s JSON. Shared
            colors are listed for each role.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea
          className="h-[60svh] min-h-0"
          viewportClassName="grid gap-5 pr-3 sm:grid-cols-2"
          role="region"
          aria-label="Theme color roles"
        >
          {themeTokenGroups.map((group) => (
            <section
              key={group.name}
              aria-label={group.name}
              className="flex min-w-0 flex-col gap-2"
            >
              <h3 className="text-sm font-medium">{group.name}</h3>
              <dl className="flex flex-col gap-1">
                {group.tokens.map((token) => (
                  <div
                    key={token}
                    className="flex min-w-0 items-center gap-2 py-1"
                  >
                    <span
                      aria-hidden="true"
                      className="size-5 shrink-0 rounded border border-foreground/15"
                      style={{ background: tokens[token] }}
                    />
                    <dt className="min-w-0 flex-1 break-all text-xs">
                      {token}
                    </dt>
                    <dd className="font-mono text-xs text-muted-foreground">
                      {tokens[token]}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </ScrollArea>
        <Button
          variant="outline"
          className="shrink-0 self-start"
          onClick={() => downloadTheme(themeDocument(theme))}
        >
          Download {theme.name}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
