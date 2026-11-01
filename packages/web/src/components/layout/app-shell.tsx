"use client";

import { useParams, usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ContextRail } from "@/components/layout/context-rail";
import { DeviceRail } from "@/components/layout/device-rail";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

function Content({ children }: { children: ReactNode }) {
  return (
    <main className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex flex-1 flex-col overflow-auto p-5 md:p-8 lg:p-10">
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
  const { isMobile, open, setOpenMobile } = useSidebar();
  const panel = useRef<PanelImperativeHandle | null>(null);
  const expandedWidth = useRef(256);
  const [resizing, setResizing] = useState(false);
  const visible = contextKey !== "home";

  useEffect(() => {
    // A section change never carries an open mobile sheet into the next section.
    if (contextKey) setOpenMobile(false);
  }, [contextKey, setOpenMobile]);

  useEffect(() => {
    if (isMobile) return;
    // Apply the command after the library commits the new collapsible constraints.
    const frame = requestAnimationFrame(() => {
      if (visible && open) panel.current?.resize(expandedWidth.current);
      else panel.current?.collapse();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, visible, isMobile]);

  useEffect(() => {
    const stop = () => setResizing(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  if (isMobile)
    return (
      <>
        <div
          className="shrink-0 overflow-hidden motion-safe:transition-[width] motion-safe:duration-200"
          style={{ width: visible ? 56 : 0 }}
          inert={!visible}
          aria-hidden={!visible}
        >
          <ContextRail />
        </div>
        {visible && <AppSidebar />}
        <div className="h-svh min-w-0 flex-1">
          <Content>{children}</Content>
        </div>
      </>
    );

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="context-layout h-svh! min-w-0"
      data-resizing={resizing}
      onLayoutChanged={(_, meta) => {
        // Only an explicitly expanded panel can be resized; container changes are not user intent.
        if (!visible || !open || !meta.isUserInteraction || !panel.current)
          return;
        expandedWidth.current = panel.current.getSize().inPixels;
      }}
    >
      <ResizablePanel
        id="navigation"
        panelRef={panel}
        defaultSize={visible ? 56 : 0}
        minSize={208}
        maxSize={384}
        collapsedSize={visible ? 56 : 0}
        collapsible={!open || !visible}
        groupResizeBehavior="preserve-pixel-size"
        className="overflow-hidden"
        style={{ overflow: "hidden" }}
      >
        <div className="h-full" inert={!visible} aria-hidden={!visible}>
          {open && visible ? <AppSidebar /> : <ContextRail />}
        </div>
      </ResizablePanel>
      <ResizableHandle
        aria-label="Resize context panel"
        style={{ backgroundColor: "transparent" }}
        disabled={!visible || !open}
        className={
          !visible
            ? "hidden"
            : !open
              ? "pointer-events-none after:hidden"
              : undefined
        }
        onPointerDown={() => setResizing(true)}
      />
      <ResizablePanel id="workspace" minSize={320}>
        <Content>{children}</Content>
      </ResizablePanel>
    </ResizablePanelGroup>
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
  const [contextState, setContextState] = useState({
    key: contextKey,
    open: false,
  });
  if (contextState.key !== contextKey) {
    setContextState({ key: contextKey, open: false });
  }
  const open = contextState.key === contextKey && contextState.open;
  return (
    <SidebarProvider
      open={open}
      onOpenChange={(value) =>
        setContextState({ key: contextKey, open: value })
      }
    >
      <div className="flex h-svh w-full min-w-0">
        <DeviceRail />
        <ShellLayout contextKey={contextKey}>{children}</ShellLayout>
      </div>
    </SidebarProvider>
  );
}
