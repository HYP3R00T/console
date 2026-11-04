"use client";
import { MessageSquare, Pencil, Pin, PinOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  type NavigationAction,
  NavigationMenu,
} from "@/components/layout/navigation-menu";
import { NavigationRow } from "@/components/layout/navigation-row";
import { SidebarAction } from "@/components/layout/sidebar-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useBackendRequest } from "@/hooks/use-backend-request";
import { conversationKey } from "@/lib/conversation-pins";
import { useConversationPins } from "./conversation-preferences";
import { sessionsChanged } from "./use-project-sessions";

export function ConversationRow({
  sessionId,
  projectId,
  conversation,
  href,
  compact = false,
  closeMobile = () => {},
}: {
  sessionId: string;
  projectId?: string;
  conversation: { id: number; name: string };
  href: string;
  compact?: boolean;
  closeMobile?: () => void;
}) {
  const pathname = usePathname();
  const { request } = useBackendRequest();
  const preferences = useConversationPins();
  const key = conversationKey(sessionId, conversation.id);
  const pinned = preferences.pins.includes(key);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(conversation.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const actions: NavigationAction[] = [
    {
      id: "rename",
      label: "Rename",
      icon: Pencil,
      onSelect: () => {
        setName(conversation.name);
        setError(undefined);
        setRenaming(true);
      },
    },
    {
      id: "toggle-pin",
      label: pinned ? "Unpin" : "Pin to top",
      icon: pinned ? PinOff : Pin,
      disabled: !preferences.ready || !!preferences.error,
      onSelect: () => {
        try {
          preferences.setPin(key, !pinned);
          setError(undefined);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not pin conversation.",
          );
        }
      },
    },
  ];
  const link = (
    <SidebarAction
      compact={compact}
      nativeButton={false}
      className={compact ? undefined : "h-7 px-2 hover:bg-transparent"}
      render={<Link href={href} onClick={closeMobile} />}
      aria-label={conversation.name}
      title={
        compact ? `${conversation.name}${pinned ? " · pinned" : ""}` : undefined
      }
      aria-current={pathname === href ? "page" : undefined}
    >
      {compact && <MessageSquare />}
      {!compact && (
        <span className="min-w-0 flex-1 truncate">{conversation.name}</span>
      )}
    </SidebarAction>
  );
  return (
    <>
      <NavigationMenu
        kind="conversation"
        dragItem={{
          kind: "conversation",
          sessionId,
          id: conversation.id,
          projectId,
        }}
        label={`Actions for ${conversation.name}`}
        actions={actions}
      >
        {(menu) =>
          compact ? (
            link
          ) : (
            <NavigationRow selected={pathname === href} actions={menu}>
              {link}
            </NavigationRow>
          )
        }
      </NavigationMenu>
      {(error || preferences.error) && !renaming && (
        <p
          role="alert"
          className={compact ? "sr-only" : "px-2 text-xs text-destructive"}
        >
          {error ?? preferences.error}
        </p>
      )}
      <Dialog
        open={renaming}
        onOpenChange={(open) => {
          if (!busy) setRenaming(open);
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || !name.trim()) return;
              setBusy(true);
              setError(undefined);
              void request(
                `/v1/sessions/${sessionId}/conversations/${conversation.id}`,
                { method: "PUT", body: JSON.stringify({ name: name.trim() }) },
              )
                .then(() => {
                  sessionsChanged();
                  setRenaming(false);
                })
                .catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not rename conversation.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            <Field>
              <FieldLabel
                htmlFor={`conversation-name-${sessionId}-${conversation.id}`}
              >
                Name
              </FieldLabel>
              <Input
                id={`conversation-name-${sessionId}-${conversation.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
                autoFocus
              />
            </Field>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setRenaming(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
