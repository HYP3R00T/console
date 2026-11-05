"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { useWorkspaceChrome } from "@/components/layout/workspace-chrome";
import { ConversationInspectorLoading } from "./conversation-inspector";

/** Reserve the details slot while a connected conversation is being resolved. */
export function usePendingConversationInspector(pending: boolean) {
  const route = usePathname();
  const { setInspector } = useWorkspaceChrome();
  useLayoutEffect(() => {
    if (!pending) return;
    const inspector = {
      route,
      title: "Conversation details",
      content: <ConversationInspectorLoading />,
    };
    setInspector(inspector);
    return () =>
      setInspector((current) => (current === inspector ? undefined : current));
  }, [pending, route, setInspector]);
}
