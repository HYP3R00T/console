"use client";
import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ImportedTheme } from "@/lib/configuration/store";
import { downloadTheme } from "@/lib/configuration/theme-export";
import type { ThemeFamily } from "@/lib/configuration/theme-gallery";
import { completeTheme, themeDocument } from "@/lib/configuration/themes";
import { ThemePreview } from "./theme-preview";

function VariantTab({
  item,
  disabled,
}: {
  item: ThemeFamily["variants"][number];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        delay={300}
        render={
          <TabsTrigger
            value={item.theme.id}
            disabled={disabled}
            aria-label={item.label}
            title={item.label}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            style={{
              backgroundColor: completeTheme(item.theme).tokens.background,
            }}
            className="size-6 h-6 flex-none rounded-md p-0 data-active:ring-1 data-active:ring-ring data-active:ring-offset-2 data-active:ring-offset-background"
          >
            <span className="sr-only">{item.label}</span>
          </TabsTrigger>
        }
      />
      <TooltipContent side="top">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function ThemeFamilyCard({
  family,
  selected,
  disabled,
  onSelect,
  onInspect,
  onMessage,
  onError,
}: {
  family: ThemeFamily;
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onInspect: (theme: ImportedTheme) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [lastVariant, setLastVariant] = useState(family.variants[0].theme.id);
  const selectedVariant = family.variants.find(
    (item) => item.theme.id === selected,
  );
  const shown =
    selectedVariant ??
    family.variants.find((item) => item.theme.id === lastVariant) ??
    family.variants[0];
  const theme = shown.theme;
  function choice(item: ThemeFamily["variants"][number]) {
    return (
      <ToggleGroupItem
        value={item.theme.id}
        aria-label={`Use ${item.theme.name}${item.theme.id.startsWith("custom-") ? " (imported)" : ""}`}
        variant="outline"
        className="h-auto w-full min-w-0 flex-col gap-4 rounded-xl p-4 aria-pressed:ring-1 aria-pressed:ring-ring"
      >
        <span className="flex w-full min-w-0 justify-between gap-2 text-left">
          <span className="truncate">{family.name}</span>
          <span className="shrink-0 text-muted-foreground">{item.label}</span>
        </span>
        <ThemePreview theme={item.theme} />
      </ToggleGroupItem>
    );
  }
  const content = (
    <>
      {family.variants.length > 1
        ? family.variants.map((item) => (
            <TabsContent key={item.theme.id} value={item.theme.id}>
              {choice(item)}
            </TabsContent>
          ))
        : choice(shown)}
      <div className="flex h-8 items-center justify-between gap-2 px-1">
        {family.variants.length > 1 ? (
          <TabsList
            aria-label={`${family.name} ${theme.mode} variants`}
            className="h-8! shrink-0 gap-1 bg-transparent p-0"
          >
            {family.variants.map((item) => (
              <VariantTab key={item.theme.id} item={item} disabled={disabled} />
            ))}
          </TabsList>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`All colors for ${theme.name}${theme.id.startsWith("custom-") ? " (imported)" : ""}`}
            onClick={() => onInspect(theme)}
          >
            All colors
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Download ${theme.name}${theme.id.startsWith("custom-") ? " (imported)" : ""}`}
            title={`Download ${theme.name}`}
            disabled={disabled}
            onClick={() => {
              try {
                downloadTheme(themeDocument(theme));
                onMessage(`${theme.name} downloaded.`);
              } catch (error) {
                onError(
                  error instanceof Error
                    ? error.message
                    : "Theme download failed.",
                );
              }
            }}
          >
            <Download />
          </Button>
        </div>
      </div>
    </>
  );
  return (
    <section
      aria-label={`${theme.mode} ${family.name}`}
      className="flex min-w-0 flex-col gap-2"
    >
      {family.variants.length > 1 ? (
        <Tabs
          value={theme.id}
          onValueChange={(id) => {
            if (family.variants.some((item) => item.theme.id === id)) {
              setLastVariant(id);
              onSelect(id);
            }
          }}
        >
          {content}
        </Tabs>
      ) : (
        content
      )}
    </section>
  );
}
