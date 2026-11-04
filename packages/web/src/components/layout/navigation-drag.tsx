"use client";
import {
  createContext,
  type DragEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useMachineProjects } from "@/components/projects/projects-provider";
import { useConversationPins } from "@/components/sessions/conversation-preferences";
import { conversationKey } from "@/lib/conversation-pins";
import {
  type NavigationDragItem,
  type NavigationDropTarget,
  navigationDropIntent,
} from "@/lib/navigation-drop";

const Context = createContext<{
  item?: NavigationDragItem;
  start: (item: NavigationDragItem, event: DragEvent) => void;
  end: () => void;
  explain: (message: string) => void;
  drop: (target: NavigationDropTarget) => void;
} | null>(null);
export const useNavigationDrag = () => useContext(Context);
export function NavigationDragProvider({
  deviceId,
  children,
}: {
  deviceId: string;
  children: ReactNode;
}) {
  const { connected, client, setPinned } = useMachineProjects(deviceId);
  const preferences = useConversationPins();
  const sourceClient = useRef(client);
  const [item, setItem] = useState<NavigationDragItem>();
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 8000);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <Context
      value={{
        item,
        explain: setMessage,
        start: (entity, event) => {
          if (
            !connected ||
            (event.target as HTMLElement).closest(".navigation-actions")
          ) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(
            "application/x-console-navigation",
            entity.kind,
          );
          setMessage("");
          sourceClient.current = client;
          setItem(entity);
        },
        end: () => setItem(undefined),
        drop: (target) => {
          if (!item || !connected || sourceClient.current !== client) {
            setItem(undefined);
            return;
          }
          const intent = navigationDropIntent(item, target);
          try {
            if ("reason" in intent) setMessage(intent.reason);
            else {
              if (item.kind === "project") setPinned(item.id, intent.pinned);
              else
                preferences.setPin(
                  conversationKey(item.sessionId, item.id),
                  intent.pinned,
                );
              setMessage(
                intent.pinned ? "Pinned." : "Returned to its original list.",
              );
            }
          } catch (cause) {
            setMessage(
              cause instanceof Error ? cause.message : "Could not update pins.",
            );
          }
          setItem(undefined);
        },
      }}
    >
      {message &&
        createPortal(
          <p
            role="status"
            className="pointer-events-none fixed bottom-4 left-20 z-50 max-w-72 rounded-lg bg-popover p-3 text-xs text-popover-foreground shadow-lg"
          >
            {message}
          </p>,
          document.body,
        )}
      {children}
    </Context>
  );
}
export function NavigationDropZone({
  target,
  children,
}: {
  target: NavigationDropTarget;
  children: ReactNode;
}) {
  const drag = useNavigationDrag();
  const [over, setOver] = useState(false);
  const dragging = !!drag?.item;
  useEffect(() => {
    if (!dragging) setOver(false);
  }, [dragging]);
  const supported =
    drag?.item && "pinned" in navigationDropIntent(drag.item, target);
  return (
    <fieldset
      aria-label={
        typeof target === "string"
          ? `${target} drop target`
          : "Project drop target"
      }
      className={
        over && supported
          ? "min-w-0 rounded-md ring-1 ring-sidebar-ring"
          : "min-w-0"
      }
      onDragEnter={(event) => {
        if (!drag?.item) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = supported ? "move" : "none";
        setOver(true);
      }}
      onDragOver={(event) => {
        if (!drag?.item) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = supported ? "move" : "none";
        const intent = navigationDropIntent(drag.item, target);
        drag.explain("reason" in intent ? intent.reason : "");
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOver(false);
      }}
      onDrop={(event) => {
        if (!drag?.item) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        drag.drop(target);
      }}
    >
      {children}
    </fieldset>
  );
}
