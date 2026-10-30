"use client";

import type { ReactNode } from "react";
import { DetailsPanel } from "@/components/details/panel";
import { WorkspaceNavigation } from "@/components/navigation/sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ChatContent } from "./content";
import { useChatSession } from "./use-chat-session";
import { useWorkspaceLayout } from "./use-workspace-layout";
export function ChatWorkspace({ management }: { management?: ReactNode }) {
  const layout = useWorkspaceLayout(Boolean(management));
  const chat = useChatSession();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      {(chat.error || chat.connectionError || chat.detailError) && (
        <p
          role="alert"
          className="shrink-0 border-b bg-destructive/5 px-5 py-3 text-sm text-destructive"
        >
          {chat.error || chat.connectionError || chat.detailError}
        </p>
      )}
      <main className="relative flex min-h-0 flex-1">
        <ResizablePanelGroup
          groupRef={layout.layoutRef}
          orientation={layout.compact ? "vertical" : "horizontal"}
          resizeTargetMinimumSize={{ fine: 12, coarse: 24 }}
          onLayoutChanged={(nextLayout, meta) => {
            if (!meta.isUserInteraction) return;
            if (layout.navigationOpen) {
              if (layout.compact)
                layout.compactNavigation.current = nextLayout.navigation;
              else layout.expandedNavigation.current = nextLayout.navigation;
            }
            if (layout.inspectorOpen && !layout.compact && !management)
              layout.expandedInspector.current = nextLayout.details;
            layout.rememberSizes();
          }}
        >
          <ResizablePanel
            id="navigation"
            collapsible={false}
            defaultSize={`${layout.compact ? layout.compactNavigation.current : layout.expandedNavigation.current}%`}
            minSize={
              layout.navigationOpen
                ? layout.compact
                  ? "25%"
                  : "260px"
                : "40px"
            }
            maxSize={
              layout.navigationOpen ? (layout.compact ? "65%" : "50%") : "40px"
            }
          >
            <WorkspaceNavigation chat={chat} layout={layout} />
          </ResizablePanel>
          {layout.navigationOpen && (
            <ResizableHandle
              withHandle
              aria-label="Resize project and conversation navigation"
              title="Drag to resize sidebar; use arrow keys when focused"
            />
          )}
          <ResizablePanel id="conversation" minSize="30%">
            <div
              className={management ? "hidden" : "flex h-full min-h-0 flex-col"}
            >
              <ChatContent chat={chat} layout={layout} />
            </div>
            <div
              className={
                management
                  ? "flex h-full min-h-0 flex-col overflow-auto"
                  : "hidden"
              }
            >
              {management}
            </div>
          </ResizablePanel>
          {layout.inspectorOpen && !layout.compact && !management && (
            <ResizableHandle
              withHandle
              aria-label="Resize details panel"
              title="Drag to resize details; use arrow keys when focused"
            />
          )}
          <ResizablePanel
            id="details"
            defaultSize="0px"
            minSize={
              layout.inspectorOpen && !layout.compact && !management
                ? "320px"
                : "0px"
            }
            maxSize={
              layout.inspectorOpen && !layout.compact && !management
                ? "45%"
                : "0px"
            }
            className={layout.compact ? "overflow-visible!" : ""}
          >
            <DetailsPanel
              chat={chat}
              layout={management ? { ...layout, inspectorOpen: false } : layout}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
