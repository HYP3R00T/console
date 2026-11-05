"use client";

import { PanelLeft, PanelRight } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { DeviceRail } from "@/components/layout/device-rail";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import {
  useWorkspaceChrome,
  WorkspaceChromeProvider,
} from "./workspace-chrome";

function Content({ children }: { children: ReactNode }) {
  return (
    <main className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-5 md:p-6">
        {children}
      </div>
    </main>
  );
}
function ShellLayout({
  children,
  contextKey,
}: {
  children: ReactNode;
  contextKey: string;
}) {
  const pathname = usePathname();
  const { isMobile, open, setOpen, openMobile, setOpenMobile } = useSidebar();
  const chrome = useWorkspaceChrome();
  const active =
    chrome.conversation?.route === pathname ? chrome.conversation : undefined;
  const [inspectorOverlay, setInspectorOverlay] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1199px)");
    const update = () => setInspectorOverlay(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [desktopInspectorOpen, setDesktopInspectorOpen] = useState(true);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const inspectorOpen = inspectorOverlay
    ? mobileInspectorOpen
    : desktopInspectorOpen;
  const setInspectorOpen = inspectorOverlay
    ? setMobileInspectorOpen
    : setDesktopInspectorOpen;
  const panel = useRef<PanelImperativeHandle | null>(null);
  const expandedWidth = useRef(256);
  const [resizing, setResizing] = useState(false);
  const [navigationTransition, setNavigationTransition] = useState(false);
  const hasContext = contextKey !== "home";
  const visible = hasContext && open && !isMobile;
  useEffect(() => {
    if (contextKey) setOpenMobile(false);
  }, [contextKey, setOpenMobile]);
  useEffect(() => {
    setNavigationTransition(true);
    const finish = window.setTimeout(() => setNavigationTransition(false), 240);
    const frame = requestAnimationFrame(() => {
      if (visible) panel.current?.resize(expandedWidth.current);
      else panel.current?.collapse();
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(finish);
    };
  }, [visible]);
  useEffect(() => {
    const stop = () => setResizing(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);
  const navigationLabel = (isMobile ? openMobile : open)
    ? "Hide workspace navigation"
    : "Show workspace navigation";
  const inspectorLabel = inspectorOpen
    ? "Hide activity inspector"
    : "Show activity inspector";
  const identityLabel = active
    ? `${active.subtitle} / ${active.title}`
    : "Console";
  const inspector = (
    <div ref={chrome.setInspectorHost} className="h-full min-h-0" />
  );
  return (
    <div className="flex h-svh w-full min-w-0 flex-col bg-client-surface">
      <div className="flex min-h-0 flex-1">
        {isMobile && (
          <Sheet open={openMobile} onOpenChange={setOpenMobile}>
            <SheetContent
              side="left"
              className="left-14! w-[min(calc(100vw-56px),344px)]! max-w-none! gap-0 border-0 bg-context-surface p-0"
            >
              <SheetHeader className="h-11 shrink-0 justify-center py-0 pr-12">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div id="workspace-navigation" className="flex min-h-0 flex-1">
                <div className="min-w-0 flex-1">
                  {hasContext ? (
                    <AppSidebar />
                  ) : (
                    <div className="p-4 text-sm">
                      Choose a machine or client preferences.
                    </div>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        )}
        <DeviceRail />
        <ResizablePanelGroup
          orientation="horizontal"
          className="context-layout h-full! min-w-0"
          data-resizing={resizing}
          data-navigation-transition={navigationTransition}
          onLayoutChanged={(_, meta) => {
            if (visible && meta.isUserInteraction && panel.current)
              expandedWidth.current = panel.current.getSize().inPixels;
          }}
        >
          <ResizablePanel
            id="navigation"
            panelRef={panel}
            defaultSize={visible ? 256 : 0}
            minSize={208}
            maxSize={384}
            collapsedSize={0}
            collapsible={!visible}
            groupResizeBehavior="preserve-pixel-size"
            className="overflow-hidden"
            style={{ overflow: "hidden" }}
          >
            <div
              id={isMobile ? undefined : "workspace-navigation"}
              className="h-full"
              inert={!visible}
              aria-hidden={!visible}
            >
              {hasContext && !isMobile && <AppSidebar />}
            </div>
          </ResizablePanel>
          <ResizableHandle
            aria-label="Resize navigation"
            disabled={!visible}
            className={!visible ? "hidden" : undefined}
            style={{ backgroundColor: "transparent" }}
            onPointerDown={() => setResizing(true)}
          />
          <ResizablePanel id="workspace" minSize={240} className="py-2 pr-2">
            <div className="h-full min-h-0 overflow-hidden rounded-xl border border-solid border-border/50">
              <Content>{children}</Content>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
        {!inspectorOverlay && (
          <aside
            id="activity-inspector"
            aria-label="Conversation activity inspector"
            aria-hidden={!active || !inspectorOpen}
            inert={!active || !inspectorOpen}
            className="shrink-0 overflow-hidden bg-context-surface motion-safe:transition-[width] motion-safe:duration-200"
            style={{ width: active && inspectorOpen ? 300 : 0 }}
          >
            {inspector}
          </aside>
        )}
        {inspectorOverlay && active && (
          <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
            <SheetContent
              id="activity-inspector"
              side="right"
              className="w-[min(100vw,360px)]! max-w-none! gap-0 border-0 bg-context-surface p-0"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Conversation activity</SheetTitle>
              </SheetHeader>
              {inspector}
            </SheetContent>
          </Sheet>
        )}
      </div>
      <footer className="flex h-9 shrink-0 items-center gap-3 bg-client-surface px-3">
        <ControlTooltip label={navigationLabel}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={navigationLabel}
            aria-expanded={isMobile ? openMobile : open}
            disabled={!hasContext}
            aria-controls="workspace-navigation"
            onClick={() =>
              isMobile ? setOpenMobile(!openMobile) : setOpen(!open)
            }
          >
            <PanelLeft />
          </Button>
        </ControlTooltip>
        <ControlTooltip label={identityLabel}>
          <div className="min-w-0 flex-1 truncate text-xs">
            {active ? (
              <>
                <span className="text-muted-foreground">
                  {active.subtitle} /{" "}
                </span>
                <span className="font-medium">{active.title}</span>
              </>
            ) : (
              <span className="font-medium">Console</span>
            )}
          </div>
        </ControlTooltip>
        {active && (
          <ControlTooltip label={inspectorLabel}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={inspectorLabel}
              aria-expanded={inspectorOpen}
              aria-controls="activity-inspector"
              onClick={() => setInspectorOpen(!inspectorOpen)}
            >
              <PanelRight />
            </Button>
          </ControlTooltip>
        )}
      </footer>
    </div>
  );
}
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { deviceId } = useParams<{ deviceId?: string }>();
  const contextKey = pathname.startsWith("/settings")
    ? "preferences"
    : deviceId
      ? `device:${deviceId}`
      : "home";
  return (
    <WorkspaceChromeProvider>
      <SidebarProvider defaultOpen className="min-h-0! h-svh">
        <ShellLayout contextKey={contextKey}>{children}</ShellLayout>
      </SidebarProvider>
    </WorkspaceChromeProvider>
  );
}
