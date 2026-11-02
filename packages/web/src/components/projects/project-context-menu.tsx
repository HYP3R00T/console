"use client";
import { Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export function ProjectContextMenu({
  children,
  name,
  href,
  pinned,
  onPin,
  onRemove,
  onEdit,
}: {
  children: ReactNode;
  name: string;
  href: string;
  pinned: boolean;
  onPin: () => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const PinIcon = pinned ? PinOff : Pin;
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="flex min-w-0 flex-col"
        aria-description={`Actions for ${name}: right-click or press Shift+F10.`}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-40">
        <ContextMenuItem
          onClick={() => {
            router.push(`${href}/settings`);
            onEdit();
          }}
        >
          <Pencil />
          Edit
        </ContextMenuItem>
        <ContextMenuItem onClick={onPin}>
          <PinIcon />
          {pinned ? "Unpin" : "Pin to top"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onRemove}>
          <Trash2 />
          Remove
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
