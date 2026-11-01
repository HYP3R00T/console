"use client";

import {
  Bot,
  ChevronRight,
  Folder,
  GitBranch,
  Layers,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function ProjectTree({
  deviceId,
  closeMobile,
}: {
  deviceId: string;
  closeMobile: () => void;
}) {
  const base = `/devices/${encodeURIComponent(deviceId)}/preview`;
  const pathname = usePathname();
  function conversation(id: string, label: string, Icon: typeof MessageSquare) {
    const href = `${base}/${id}`;
    return (
      <Button
        nativeButton={false}
        variant="ghost"
        className={cn(
          "navigation-row h-9 w-full justify-start gap-2 px-2",
          pathname === href && "bg-sidebar-accent",
        )}
        render={<Link href={href} onClick={closeMobile} />}
        aria-current={pathname === href ? "page" : undefined}
      >
        <Icon className="size-4" />
        <span className="truncate">{label}</span>
      </Button>
    );
  }
  return (
    <section aria-label="Project hierarchy preview" className="min-w-0 px-2">
      <div className="mb-2 flex items-center justify-between px-3">
        <h3 className="text-xs font-medium text-muted-foreground">Projects</h3>
        <Badge variant="outline" className="text-[9px] font-normal">
          Preview
        </Badge>
      </div>
      <Collapsible defaultOpen className="group/project">
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="navigation-row h-9 w-full justify-start gap-2 px-2"
            />
          }
        >
          <ChevronRight className="size-3 transition-transform group-data-open/project:rotate-90" />
          <Folder className="size-4" />
          <span className="truncate">Example project</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="tree-children">
            <li className="tree-branch">
              <Collapsible defaultOpen className="group/session">
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="navigation-row h-9 w-full justify-start gap-2 px-2"
                    />
                  }
                >
                  <ChevronRight className="size-3 transition-transform group-data-open/session:rotate-90" />
                  <Layers className="size-4" />
                  <span className="truncate">Example session</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="tree-children">
                    <li className="tree-branch">
                      {conversation("main", "Main conversation", MessageSquare)}
                      <ul className="tree-children">
                        <li className="tree-branch">
                          {conversation("subagent", "Subagent preview", Bot)}
                        </li>
                      </ul>
                    </li>
                    <li className="tree-branch">
                      {conversation("fork", "Fork preview", GitBranch)}
                    </li>
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            </li>
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
