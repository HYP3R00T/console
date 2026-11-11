"use client";
import { useCallback, useMemo } from "react";
import { useNavigationMemory } from "@/components/layout/navigation-memory";
import {
  availableInspectorSelection,
  type InspectorScope,
  type InspectorSection,
  inspectorPreferenceKey,
} from "@/lib/inspector-preferences";
export function useInspectorSelection(
  backend: string | undefined,
  sessionId: string,
  conversationId: string,
  hasProject: boolean,
) {
  const { memory, setInspectorSelection, storageError } = useNavigationMemory();
  const key = backend
    ? inspectorPreferenceKey(backend, sessionId, conversationId)
    : undefined;
  const saved = key ? memory.inspectors?.[key] : undefined;
  const selection = useMemo(
    () => availableInspectorSelection(saved, hasProject),
    [saved, hasProject],
  );
  const selectScope = useCallback(
    (scope: InspectorScope) => {
      if (key && (scope !== "project" || hasProject))
        setInspectorSelection(key, { ...selection, scope });
    },
    [key, hasProject, selection, setInspectorSelection],
  );
  const selectSection = useCallback(
    (section: InspectorSection) => {
      if (key) setInspectorSelection(key, { ...selection, section });
    },
    [key, selection, setInspectorSelection],
  );
  const openSection = useCallback(
    (section: InspectorSection) => {
      if (key) setInspectorSelection(key, { scope: "conversation", section });
    },
    [key, setInspectorSelection],
  );
  return { selection, selectScope, selectSection, openSection, storageError };
}
