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
};
const Context = createContext<{
  conversation?: WorkspaceConversation;
  setConversation: Dispatch<SetStateAction<WorkspaceConversation | undefined>>;
  inspectorHost: HTMLDivElement | null;
  setInspectorHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
} | null>(null);
/** Route content publishes identity and portals its existing stream projection into the shell. */
export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  const [conversation, setConversation] = useState<WorkspaceConversation>();
  const [inspectorHost, setInspectorHost] = useState<HTMLDivElement | null>(
    null,
  );
  return (
    <Context
      value={{ conversation, setConversation, inspectorHost, setInspectorHost }}
    >
      {children}
    </Context>
  );
}
export function useWorkspaceChrome() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceChromeProvider is required.");
  return value;
}
