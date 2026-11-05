"use client";

import { PanelLeft, PanelRight } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ControlTooltip } from "./control-tooltip";

/** Both context slots share clipping, resizing, accessibility and overlay behavior. */
export function WorkspaceSidebar({
  side,
  panelId,
  contentId,
  title,
  resizeLabel,
  available,
  open,
  onOpenChange,
  overlay,
  initialWidth,
  minWidth,
  maxWidth,
  transitioning,
  onResizeStart,
  children,
}: {
  side: "left" | "right";
  panelId: string;
  contentId: string;
  title: string;
  resizeLabel: string;
  available: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overlay: boolean;
  initialWidth: number;
  minWidth: number;
  maxWidth: number | string;
  transitioning: boolean;
  onResizeStart: () => void;
  children: ReactNode;
}) {
  const visible = available && open && !overlay;
  const element = useRef<HTMLDivElement | null>(null);
  const initialSize = useRef(visible ? initialWidth : 0);
  const previousVisible = useRef(visible);
  const [contentWidth, setContentWidth] = useState(initialWidth);
  useLayoutEffect(() => {
    const wasVisible = previousVisible.current;
    previousVisible.current = visible;
    if (visible && wasVisible && !transitioning && element.current?.offsetWidth)
      setContentWidth(element.current.offsetWidth);
  }, [visible, transitioning]);
  const handle = (
    <ResizableHandle
      aria-label={resizeLabel}
      disabled={!visible}
      className={!visible ? "hidden" : undefined}
      style={{ backgroundColor: "transparent" }}
      onPointerDown={onResizeStart}
    />
  );
  const overlayOffset = side === "left" ? 56 : 0;
  return (
    <>
      {side === "right" && handle}
      <ResizablePanel
        id={panelId}
        elementRef={element}
        data-workspace-sidebar
        data-side={side}
        defaultSize={initialSize.current}
        minSize={minWidth}
        maxSize={maxWidth}
        collapsedSize={0}
        collapsible={!visible}
        groupResizeBehavior="preserve-pixel-size"
        style={{ position: "relative", overflow: "hidden" }}
        onResize={({ inPixels }) => {
          // Follow real resizing, but never lay text out at a toggle's intermediate width.
          if (visible && !transitioning && inPixels > 0)
            setContentWidth(inPixels);
        }}
      >
        {!overlay && (
          <aside
            id={contentId}
            aria-label={title}
            aria-hidden={!visible}
            inert={!visible}
            data-sidebar-surface
            className="absolute inset-y-0 min-h-0 overflow-hidden bg-context-surface"
            style={{ [side]: 0, width: contentWidth }}
          >
            {children}
          </aside>
        )}
      </ResizablePanel>
      {side === "left" && handle}
      {overlay && available && (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            id={contentId}
            side={side}
            className="max-w-none! gap-0 border-0 bg-context-surface p-0"
            style={{
              [side]: overlayOffset,
              width: `min(calc(100vw - ${overlayOffset}px), 360px)`,
            }}
          >
            <SheetHeader className="h-11 shrink-0 justify-center py-0 pr-12">
              <SheetTitle>{title}</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1">{children}</div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

export function WorkspaceSidebarToggle({
  side,
  label,
  controls,
  open,
  onOpenChange,
  disabled,
}: {
  side: "left" | "right";
  label: string;
  controls: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}) {
  const tooltip = `${open ? "Hide" : "Show"} ${label}`;
  const Icon = side === "left" ? PanelLeft : PanelRight;
  return (
    <ControlTooltip label={tooltip}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={tooltip}
        aria-expanded={open}
        aria-controls={controls}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        <Icon />
      </Button>
    </ControlTooltip>
  );
}
