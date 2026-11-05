"use client";

import { PanelLeft, PanelRight } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  ViewTransition,
} from "react";
import type { GroupImperativeHandle } from "react-resizable-panels";
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

function panelGroupWidth(element: HTMLDivElement) {
  const separators = Array.from(element.children).filter(
    (child) => !child.hasAttribute("data-panel"),
  );
  return (
    element.clientWidth -
    separators.reduce(
      (total, child) => total + (child as HTMLElement).offsetWidth,
      0,
    )
  );
}

function Content({ children }: { children: ReactNode }) {
  return (
    <main className="flex h-full min-w-0 flex-col bg-background">
      <ViewTransition default="none" update="workspace-fade">
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-5 md:p-6">
          {children}
        </div>
      </ViewTransition>
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
  const details =
    chrome.inspector?.route === pathname ? chrome.inspector : undefined;
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
  const expandedWidth = useRef(256);
  const inspectorWidth = useRef(300);
  const inspectorVisible = !!details && inspectorOpen && !inspectorOverlay;
  const group = useRef<GroupImperativeHandle | null>(null);
  const groupElement = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState(false);
  const [panelTransition, setPanelTransition] = useState(false);
  const hasContext = contextKey !== "home";
  const visible = hasContext && open && !isMobile;
  useEffect(() => {
    if (contextKey) setOpenMobile(false);
  }, [contextKey, setOpenMobile]);
  useEffect(() => {
    setPanelTransition(true);
    const finish = window.setTimeout(() => setPanelTransition(false), 240);
    // Apply both sidebar widths together after the library updates constraints.
    // Individual resize calls redistribute space across every sibling panel.
    const frame = requestAnimationFrame(() => {
      const element = groupElement.current;
      if (!element || !group.current) return;
      const width = panelGroupWidth(element);
      if (width <= 0) return;
      const navigation = visible ? (expandedWidth.current / width) * 100 : 0;
      const inspector = inspectorVisible
        ? Math.min((inspectorWidth.current / width) * 100, 40)
        : 0;
      group.current.setLayout({
        navigation,
        workspace: 100 - navigation - inspector,
        inspector,
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(finish);
    };
  }, [visible, inspectorVisible]);
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
    ? "Hide details sidebar"
    : "Show details sidebar";
  const identityLabel = active
    ? `${active.subtitle} / ${active.title}`
    : "Console";
  const inspector = (
    <ViewTransition default="none" update="workspace-fade">
      <div className="h-full min-h-0">{details?.content}</div>
    </ViewTransition>
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
          groupRef={group}
          elementRef={groupElement}
          orientation="horizontal"
          className="context-layout h-full! min-w-0"
          data-resizing={resizing}
          data-panel-transition={panelTransition}
          onLayoutChanged={(layout, meta) => {
            if (!meta.isUserInteraction || !groupElement.current) return;
            const width = panelGroupWidth(groupElement.current);
            if (visible)
              expandedWidth.current = (layout.navigation / 100) * width;
            if (inspectorVisible)
              inspectorWidth.current = (layout.inspector / 100) * width;
          }}
        >
          <ResizablePanel
            id="navigation"
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
          <ResizableHandle
            aria-label="Resize details sidebar"
            disabled={!inspectorVisible}
            className={!inspectorVisible ? "hidden" : undefined}
            style={{ backgroundColor: "transparent" }}
            onPointerDown={() => setResizing(true)}
          />
          <ResizablePanel
            id="inspector"
            defaultSize={0}
            minSize={240}
            maxSize="40%"
            collapsedSize={0}
            collapsible={!inspectorVisible}
            groupResizeBehavior="preserve-pixel-size"
            style={{ overflow: "hidden" }}
          >
            {!inspectorOverlay && (
              <aside
                id="workspace-inspector"
                aria-label="Workspace details"
                aria-hidden={!inspectorVisible}
                inert={!inspectorVisible}
                className="h-full min-h-0 overflow-hidden bg-context-surface"
              >
                {inspector}
              </aside>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
        {inspectorOverlay && details && (
          <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
            <SheetContent
              id="workspace-inspector"
              side="right"
              className="w-[min(100vw,360px)]! max-w-none! gap-0 border-0 bg-context-surface p-0"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{details.title}</SheetTitle>
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
        {details && (
          <ControlTooltip label={inspectorLabel}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={inspectorLabel}
              aria-expanded={inspectorOpen}
              aria-controls="workspace-inspector"
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
