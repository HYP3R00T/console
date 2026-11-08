"use client";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from "react";
export type WorkspaceConversation = {
  route: string;
  title: string;
  subtitle: string;
  sessionId?: string;
  conversationId?: string;
  projectId?: string;
};
export type WorkspaceInspector = {
  route: string;
  title: string;
  content: ReactNode;
};
const Context = createContext<{
  conversation?: WorkspaceConversation;
  setConversation: Dispatch<SetStateAction<WorkspaceConversation | undefined>>;
  inspector?: WorkspaceInspector;
  setInspector: Dispatch<SetStateAction<WorkspaceInspector | undefined>>;
} | null>(null);
/** Route-scoped identity and optional details content; layout preferences remain client-owned. */
export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  const [conversation, setConversation] = useState<WorkspaceConversation>();
  const [inspector, setInspector] = useState<WorkspaceInspector>();
  return (
    <Context value={{ conversation, setConversation, inspector, setInspector }}>
      {children}
    </Context>
  );
}
export function useWorkspaceChrome() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceChromeProvider is required.");
  return value;
}
