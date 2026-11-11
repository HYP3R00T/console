"use client";
import { ChevronRight } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  type InspectorSection,
  inspectorSectionInfo,
} from "@/lib/inspector-preferences";

const Navigation = createContext<{
  section: InspectorSection;
  request: object;
  focused: boolean;
  select: (section: InspectorSection) => void;
  available: (section: InspectorSection) => boolean;
} | null>(null);

export function InspectorNavigation({
  children,
  help,
  ...navigation
}: {
  children: ReactNode;
  section: InspectorSection;
  request: object;
  focused: boolean;
  select: (section: InspectorSection) => void;
  available: (section: InspectorSection) => boolean;
  help: () => void;
}) {
  return (
    <Navigation value={navigation}>
      <ScrollArea className="min-h-0 flex-1" aria-label="Conversation settings">
        <div className="flex min-w-0 flex-col gap-1 px-1 pb-4 pr-3">
          {children}
        </div>
      </ScrollArea>
      <Button
        size="xs"
        variant="link"
        className="shrink-0 self-start px-1"
        onClick={help}
      >
        Explore all capabilities
      </Button>
    </Navigation>
  );
}

export function InspectorPanel({
  value,
  active,
  children,
}: {
  value: InspectorSection;
  active: InspectorSection;
  children: ReactNode | ((expanded: boolean) => ReactNode);
}) {
  const navigation = useContext(Navigation);
  if (!navigation) throw new Error("InspectorNavigation is required.");
  const { request, focused, select, available } = navigation;
  const enabled = available(value);
  const [open, setOpen] = useState(value === active);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const previousRequest = useRef(request);
  // Explicit navigation (including re-invoking the same command) reveals its target.
  // Background refreshes leave disclosure state and scroll position untouched.
  useEffect(() => {
    const explicitRequest = previousRequest.current !== request;
    previousRequest.current = request;
    if (!focused || active !== value || !enabled) return;
    setOpen(true);
    if (!explicitRequest) return;
    const frame = requestAnimationFrame(() =>
      trigger.current?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [request, active, value, focused, enabled]);
  return (
    <Collapsible
      open={open && enabled}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) select(value);
      }}
      className="group/inspector-section min-w-0 scroll-mt-2"
    >
      <h2>
        <CollapsibleTrigger
          ref={trigger}
          id={id}
          render={<Button variant="ghost" />}
          disabled={!enabled}
          className="h-auto w-full justify-start whitespace-normal px-2 py-3 text-left"
        >
          <ChevronRight
            aria-hidden
            data-icon="inline-start"
            className="shrink-0 transition-transform group-data-panel-open/inspector-section:rotate-90"
          />
          <span className="min-w-0">
            <span className="block font-semibold">
              {inspectorSectionInfo[value].label}
            </span>
            {!enabled && (
              <span className="mt-1 block text-xs font-normal text-foreground/60">
                Unavailable on this backend
              </span>
            )}
          </span>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent
        keepMounted
        role="region"
        aria-labelledby={id}
        className="px-2 pt-1 pb-5 text-xs leading-relaxed"
      >
        {typeof children === "function" ? children(open && enabled) : children}
      </CollapsibleContent>
    </Collapsible>
  );
}
