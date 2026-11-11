"use client";
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";

export function ProjectDefaultTools({
  available,
  selected,
  disabled,
  onChange,
}: {
  available: string[];
  selected: string[] | null;
  disabled: boolean;
  onChange: (value: string[] | null) => void;
}) {
  const id = useId();
  const choices = [...new Set([...available, ...(selected ?? [])])];
  return (
    <FieldSet>
      <FieldLegend>New-conversation tools</FieldLegend>
      <FieldDescription>
        Copied into new conversations. Existing tool selections stay unchanged.
      </FieldDescription>
      <FieldGroup>
        <Field orientation="horizontal">
          <Switch
            id={`${id}-defaults`}
            checked={selected === null}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked ? null : [])}
          />
          <FieldLabel htmlFor={`${id}-defaults`}>
            Use built-in defaults
          </FieldLabel>
        </Field>
        {selected !== null && (
          <>
            <p className="text-xs text-muted-foreground">
              {selected.length
                ? `${selected.length} selected`
                : "No tools enabled for new conversations"}
            </p>
            <ScrollArea
              className="max-h-64"
              viewportClassName="max-h-64"
              aria-label="Project default tools"
            >
              <FieldGroup className="gap-3 pr-3">
                {choices.map((name, index) => (
                  <Field key={name} orientation="horizontal">
                    <Checkbox
                      id={`${id}-${index}`}
                      checked={selected.includes(name)}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange(
                          checked
                            ? [...selected, name]
                            : selected.filter((item) => item !== name),
                        )
                      }
                    />
                    <FieldLabel
                      className="min-w-0 wrap-anywhere font-mono text-xs"
                      htmlFor={`${id}-${index}`}
                    >
                      {name}
                      {!available.includes(name) && (
                        <span className="text-muted-foreground">
                          {" "}
                          (unavailable)
                        </span>
                      )}
                    </FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
            </ScrollArea>
          </>
        )}
      </FieldGroup>
    </FieldSet>
  );
}
