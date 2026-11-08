"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import {
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
  ViewTransition,
} from "react";
import type { GroupImperativeHandle } from "react-resizable-panels";
import {
  BackendCommandsProvider,
  useBackendCommands,
} from "@/components/commands/backend-commands";
import {
  type CommandActions,
  CommandPalette,
} from "@/components/commands/command-palette";
import {
  CommandRegistryProvider,
  useRegisterCommands,
} from "@/components/commands/command-registry";
import { ShortcutPreferences } from "@/components/commands/shortcut-preferences";
import { useConnection } from "@/components/connection-provider";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { DeviceRail } from "@/components/layout/device-rail";
import { SettingsScopeNav } from "@/components/settings/settings-scope-nav";
import { Button } from "@/components/ui/button";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import {
  type BackendCommandId,
  executeBackendCommand,
} from "@/lib/backend/commands";
import {
  isPreferencesPath,
  preferencesHref,
  preferenceTarget,
} from "@/lib/preferences-navigation";
import {
  useWorkspaceChrome,
  WorkspaceChromeProvider,
} from "./workspace-chrome";

import { WorkspaceSidebar, WorkspaceSidebarToggle } from "./workspace-sidebar";

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
          <Suspense fallback={null}>
            <SettingsScopeNav />
          </Suspense>
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
  const router = useRouter();
  const { deviceId, projectId, sessionId, conversationId } = useParams<{
    deviceId?: string;
    projectId?: string;
    sessionId?: string;
    conversationId?: string;
  }>();
  const { client } = useConnection(deviceId);
  const { isMobile, open, setOpen, openMobile, setOpenMobile, toggleSidebar } =
    useSidebar();
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
  const identityLabel = active
    ? `${active.subtitle} / ${active.title}`
    : "Console";
  const machine = deviceId && `/devices/${encodeURIComponent(deviceId)}`;
  const project =
    machine &&
    (active?.projectId ?? projectId) &&
    `${machine}/projects/${encodeURIComponent(active?.projectId ?? projectId ?? "")}`;
  const draftScope =
    project && sessionId
      ? `${project}/sessions/${encodeURIComponent(sessionId)}`
      : project || machine;
  const commandActions: CommandActions = {
    "navigation.home": () => router.push("/"),
    "navigation.devices": () => router.push("/devices"),
    "preferences.appearance": () => router.push("/settings/appearance"),
    "preferences.shortcuts": () => router.push("/settings/shortcuts"),
    "workspace.navigation": hasContext ? toggleSidebar : undefined,
    "workspace.details": details
      ? () => setInspectorOpen(!inspectorOpen)
      : undefined,
    "conversation.new":
      client && draftScope
        ? () => router.push(`${draftScope}/conversations/new`)
        : undefined,
    "machine.providers": machine
      ? () => router.push(`${machine}/settings/providers`)
      : undefined,
    "machine.projects": machine
      ? () => router.push(`${machine}/settings/projects`)
      : undefined,
    "machine.runtime": machine
      ? () => router.push(`${machine}/settings/runtime`)
      : undefined,
    "machine.archives": machine
      ? () => router.push(`${machine}/settings/archives`)
      : undefined,
  };
  const discovery = useBackendCommands();
  const settingsHref = "/settings";
  const scopeDestinations: Partial<Record<BackendCommandId, string>> = {
    "machine.workspace-guidance.update": machine
      ? `${machine}/settings/guidance`
      : undefined,
    "machine.runtime-defaults.update": machine
      ? `${machine}/settings/runtime`
      : undefined,
    "project.agent-settings.update": project
      ? `${project}/settings`
      : undefined,
    "session.runtime-settings.update":
      sessionId && machine
        ? `${machine}/sessions/${encodeURIComponent(sessionId)}/settings`
        : undefined,
  };
  function commandClient() {
    if (!client) throw new Error("Connect this machine first.");
    return client;
  }
  useRegisterCommands({
    ...Object.fromEntries(
      Object.entries(
        commandActions as Record<string, (() => void) | undefined>,
      ).flatMap(([id, run]) => (run ? [[id, { run }]] : [])),
    ),
    ...(details
      ? {
          "conversation.configure": {
            run: (input?: unknown) => {
              if (input === undefined) {
                setInspectorOpen(true);
                details.selectScope?.("conversation");
                return;
              }
              return executeBackendCommand(
                commandClient(),
                "conversation.configure",
                {
                  sessionId: active?.sessionId ?? sessionId,
                  conversationId: active?.conversationId ?? conversationId,
                },
                input,
              );
            },
          },
        }
      : {}),
    "settings.open": {
      run: () =>
        router.push(
          preferencesHref(
            preferenceTarget(
              {
                deviceId,
                projectId: active?.projectId ?? projectId,
                sessionId: active?.sessionId ?? sessionId,
                conversationId: active?.conversationId ?? conversationId,
              },
              new URLSearchParams(window.location.search),
            ),
          ),
        ),
    },
    "preferences.configuration": {
      run: () => router.push("/settings/configuration"),
    },
    ...Object.fromEntries(
      Object.entries(scopeDestinations)
        .filter(([, href]) => href)
        .filter(
          ([id]) =>
            !(
              pathname.includes("/conversations/") &&
              pathname.endsWith("/settings") &&
              (id === "project.agent-settings.update" ||
                id === "session.runtime-settings.update")
            ),
        )
        .map(([id, href]) => [
          id,
          {
            disabled: !client
              ? "Connect this machine first."
              : !(
                    discovery.supports(id as BackendCommandId) ||
                    (discovery.status === "legacy" &&
                      id === "machine.runtime-defaults.update")
                  )
                ? "This backend has not advertised this command."
                : undefined,
            run: (input?: unknown) => {
              if (input === undefined) {
                const scope =
                  id === "project.agent-settings.update"
                    ? "project"
                    : id === "session.runtime-settings.update"
                      ? "session"
                      : undefined;
                if (scope && details?.selectScope) {
                  details.selectScope(scope);
                  setInspectorOpen(true);
                  return;
                }
                router.push(href ?? settingsHref);
                return;
              }
              return executeBackendCommand(
                commandClient(),
                id as BackendCommandId,
                {
                  projectId: active?.projectId ?? projectId,
                  sessionId: active?.sessionId ?? sessionId,
                  conversationId: active?.conversationId ?? conversationId,
                },
                input,
              );
            },
          },
        ]),
    ),
  });
  const inspector = (
    <ViewTransition default="none" update="workspace-fade">
      <div className="h-full min-h-0">{details?.content}</div>
    </ViewTransition>
  );
  return (
    <div className="flex h-svh w-full min-w-0 flex-col bg-client-surface">
      <div className="flex min-h-0 flex-1">
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
          <WorkspaceSidebar
            side="left"
            panelId="navigation"
            contentId="workspace-navigation"
            title="Navigation"
            resizeLabel="Resize navigation"
            available={hasContext}
            open={isMobile ? openMobile : open}
            onOpenChange={isMobile ? setOpenMobile : setOpen}
            overlay={isMobile}
            initialWidth={256}
            minWidth={208}
            maxWidth={384}
            transitioning={panelTransition && !resizing}
            onResizeStart={() => setResizing(true)}
          >
            {hasContext && <AppSidebar />}
          </WorkspaceSidebar>
          <ResizablePanel id="workspace" minSize={240} className="py-2">
            <div className="h-full min-h-0 overflow-hidden rounded-xl border border-solid border-border/50">
              <Content>{children}</Content>
            </div>
          </ResizablePanel>
          <WorkspaceSidebar
            side="right"
            panelId="inspector"
            contentId="workspace-inspector"
            title={details?.title ?? "Workspace details"}
            resizeLabel="Resize details sidebar"
            available={!!details}
            open={inspectorOpen}
            onOpenChange={setInspectorOpen}
            overlay={inspectorOverlay}
            initialWidth={300}
            minWidth={240}
            maxWidth="40%"
            transitioning={panelTransition && !resizing}
            onResizeStart={() => setResizing(true)}
          >
            {inspector}
          </WorkspaceSidebar>
        </ResizablePanelGroup>
      </div>
      <footer className="flex h-9 shrink-0 items-center gap-3 bg-client-surface px-3">
        <WorkspaceSidebarToggle
          side="left"
          label="workspace navigation"
          controls="workspace-navigation"
          open={isMobile ? openMobile : open}
          onOpenChange={isMobile ? setOpenMobile : setOpen}
          disabled={!hasContext}
        />
        <CommandPalette />
        {discovery.status === "error" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={discovery.retry}
            title={discovery.error}
          >
            Retry command discovery
          </Button>
        )}
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
          <WorkspaceSidebarToggle
            side="right"
            label="details sidebar"
            controls="workspace-inspector"
            open={inspectorOpen}
            onOpenChange={setInspectorOpen}
          />
        )}
      </footer>
    </div>
  );
}
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { deviceId } = useParams<{ deviceId?: string }>();
  const contextKey = isPreferencesPath(pathname)
    ? "preferences"
    : deviceId
      ? `device:${deviceId}`
      : "home";
  return (
    <CommandRegistryProvider>
      <BackendCommandsProvider>
        <WorkspaceChromeProvider>
          <SidebarProvider defaultOpen className="min-h-0! h-svh">
            <ShortcutPreferences>
              <ShellLayout contextKey={contextKey}>{children}</ShellLayout>
            </ShortcutPreferences>
          </SidebarProvider>
        </WorkspaceChromeProvider>
      </BackendCommandsProvider>
    </CommandRegistryProvider>
  );
}
