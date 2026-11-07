"use client";
import { useId } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useBackendRequest } from "@/hooks/use-backend-request";
import { useReviewerProfiles } from "./use-reviewer-profiles";

export function AgentProfilePicker({
  request,
  value,
  onChange,
  disabled,
}: {
  request: ReturnType<typeof useBackendRequest>["request"];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  disabled: boolean;
}) {
  const id = useId();
  const { snapshot, error } = useReviewerProfiles(request, "agent");
  const selected = snapshot?.profiles.find((profile) => profile.id === value);
  return (
    <Field>
      <FieldLabel htmlFor={id}>Agent profile</FieldLabel>
      <Select
        value={value ?? "inherit"}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next === "inherit" ? undefined : next);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue>
            {value
              ? (selected?.name ?? "Selected profile unavailable")
              : "Use chat configuration"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="inherit">Use chat configuration</SelectItem>
            {value && !selected && (
              <SelectItem value={value} disabled>
                Selected profile unavailable
              </SelectItem>
            )}
            {snapshot?.profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>
        Profiles are managed in machine settings. Model, instructions and tool
        choices are copied when work is created; tools must already be enabled
        in this chat.
      </FieldDescription>
      {error && <p role="alert">{error}</p>}
    </Field>
  );
}
