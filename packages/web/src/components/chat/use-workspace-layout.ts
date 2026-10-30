"use client";
import { useEffect, useRef, useState } from "react";
import { useGroupRef } from "react-resizable-panels";
import type { InspectorPanel } from "@/components/details/agent-panels";

function usePanelOpen(key: string) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved === "true" || saved === "false") return saved === "true";
    } catch {
      /* Storage can be unavailable in private browser configurations. */
    }
    return !window.matchMedia("(max-width: 767px)").matches;
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, String(open));
    } catch {
      /* Keep controls usable without storage. */
    }
  }, [key, open]);
  return [open, setOpen] as const;
}

function savedSize(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  try {
    const value = Number(sessionStorage.getItem(key));
    return Number.isFinite(value) && value >= 1 && value <= 70
      ? value
      : fallback;
  } catch {
    return fallback;
  }
}

export function useWorkspaceLayout(management = false) {
  const [navigationOpen, setNavigationOpen] = usePanelOpen(
    "console.network-open",
  );
  const [inspectorOpen, setInspectorOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      new URL(window.location.href).searchParams.get("inspect") === "project",
  );
  const closeControl = useRef<HTMLButtonElement>(null);
  const [contextPanel, setContextPanel] = useState(() =>
    typeof window !== "undefined"
      ? (new URL(window.location.href).searchParams.get("inspect") ?? "")
      : "",
  );
  const [inspectedProject, setInspectedProject] = useState(() =>
    typeof window !== "undefined"
      ? (new URL(window.location.href).searchParams.get("workspace") ?? "")
      : "",
  );
  useEffect(() => {
    const project = (event: Event) => {
      setInspectedProject((event as CustomEvent<string>).detail);
      setContextPanel("project");
      setInspectorOpen(true);
    };
    window.addEventListener("console:inspect-project", project);
    return () => {
      window.removeEventListener("console:inspect-project", project);
    };
  }, []);
  const [trashRevision, setTrashRevision] = useState(0);
  useEffect(() => {
    const changed = () => setTrashRevision((n) => n + 1);
    window.addEventListener("console:tree-changed", changed);
    return () => window.removeEventListener("console:tree-changed", changed);
  }, []);
  const [compact, setCompact] = useState(false);
  const [panel, setPanel] = useState<InspectorPanel>("session");
  const layoutRef = useGroupRef();
  const [initialSizes] = useState(() => ({
    navigation: savedSize("console.sidebar-size", 22),
    details: savedSize("console.details-size", 32),
  }));
  const expandedInspector = useRef(initialSizes.details);
  const expandedNavigation = useRef(initialSizes.navigation);
  function rememberSizes() {
    try {
      sessionStorage.setItem(
        "console.sidebar-size",
        String(expandedNavigation.current),
      );
      sessionStorage.setItem(
        "console.details-size",
        String(expandedInspector.current),
      );
    } catch {
      /* Resizing still works when browser storage is unavailable. */
    }
  }
  const compactNavigation = useRef(40);
  useEffect(() => {
    const navigation = navigationOpen
      ? compact
        ? compactNavigation.current
        : expandedNavigation.current
      : 0;
    const details =
      inspectorOpen && !compact && !management ? expandedInspector.current : 0;
    // Apply after the panels register their changed open/closed constraints.
    const frame = requestAnimationFrame(() => {
      layoutRef.current?.setLayout({
        navigation,
        conversation: 100 - navigation - details,
        details,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [navigationOpen, inspectorOpen, compact, management, layoutRef]);
  function closeInspector() {
    setInspectorOpen(false);
  }
  function toggleNavigation() {
    setNavigationOpen(!navigationOpen);
  }
  useEffect(() => {
    if (!inspectorOpen) return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeControl.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented)
        setInspectorOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [inspectorOpen]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setCompact(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return {
    navigationOpen,
    setNavigationOpen,
    inspectorOpen,
    setInspectorOpen,
    closeControl,
    contextPanel,
    setContextPanel,
    inspectedProject,
    setInspectedProject,
    trashRevision,
    compact,
    panel,
    setPanel,
    layoutRef,
    expandedInspector,
    expandedNavigation,
    rememberSizes,
    compactNavigation,
    closeInspector,
    toggleNavigation,
  };
}
export type WorkspaceLayout = ReturnType<typeof useWorkspaceLayout>;
