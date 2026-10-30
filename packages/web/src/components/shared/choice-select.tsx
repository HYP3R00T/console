"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ChoiceSelect({
  label,
  value,
  items,
  placeholder = "Choose an option",
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value || null}
      items={items}
      disabled={disabled}
      onValueChange={(next) => onChange(next ?? "")}
    >
      <SelectTrigger aria-label={label} className="w-full rounded-lg">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
