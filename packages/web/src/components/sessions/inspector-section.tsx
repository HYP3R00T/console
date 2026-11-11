import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Inspector sections are document structure, not boxed cards or bordered footers. */
export function InspectorSection({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      data-slot="inspector-section"
      className={cn(
        "flex min-w-0 flex-col gap-3 text-sm text-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function InspectorSectionHeader({
  className,
  ...props
}: ComponentProps<"header">) {
  return (
    <header
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
      {...props}
    />
  );
}
export function InspectorSectionTitle({
  className,
  ...props
}: ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "text-sm font-semibold leading-snug text-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function InspectorSectionDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      className={cn("text-xs leading-relaxed text-foreground/65", className)}
      {...props}
    />
  );
}
export function InspectorSectionContent({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("min-w-0 text-xs leading-relaxed", className)}
      {...props}
    />
  );
}
export function InspectorSectionActions({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

export function InspectorSectionAction({
  className,
  ...props
}: ComponentProps<"div">) {
  return <div className={cn("self-start", className)} {...props} />;
}
