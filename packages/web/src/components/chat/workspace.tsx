"use client";

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
export function ChatWorkspace() {
  const layout = useWorkspaceLayout();
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
          onLayoutChanged={(nextLayout, meta) => {
            if (!meta.isUserInteraction) return;
            if (layout.navigationOpen) {
              if (layout.compact)
                layout.compactNavigation.current = nextLayout.navigation;
              else layout.expandedNavigation.current = nextLayout.navigation;
            }
            if (layout.inspectorOpen && !layout.compact)
              layout.expandedInspector.current = nextLayout.details;
          }}
        >
          <ResizablePanel
            id="navigation"
            collapsible={false}
            defaultSize={layout.compact ? "40%" : "22%"}
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
          <ResizableHandle
            aria-label="Resize machine and session navigation"
            disabled={!layout.navigationOpen}
          />
          <ResizablePanel id="conversation" minSize="30%">
            <ChatContent chat={chat} layout={layout} />
          </ResizablePanel>
          <ResizableHandle
            disabled={!layout.inspectorOpen || layout.compact}
            className={layout.inspectorOpen && !layout.compact ? "" : "hidden"}
            aria-label="Resize details panel"
          />
          <ResizablePanel
            id="details"
            defaultSize="0px"
            minSize={layout.inspectorOpen && !layout.compact ? "320px" : "0px"}
            maxSize={layout.inspectorOpen && !layout.compact ? "45%" : "0px"}
            className={layout.compact ? "overflow-visible!" : ""}
          >
            <DetailsPanel chat={chat} layout={layout} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
