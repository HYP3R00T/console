"use client";

import { Check, Folder, X } from "lucide-react";
import { useState } from "react";
import { ControlTooltip } from "@/components/layout/control-tooltip";
import { ProjectIcon } from "@/components/projects/project-icon";
import type { Project } from "@/components/projects/projects-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DraftProjectPicker({
  project,
  projects,
  disabled,
  onSelect,
}: {
  project?: Project;
  projects: Project[];
  disabled: boolean;
  onSelect: (id?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-open={open || undefined}
      className="group/project-picker flex min-w-0 shrink items-center rounded-full hover:bg-accent/50 data-open:bg-accent/50"
    >
      {project && (
        <ControlTooltip label="Clear project for this chat">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label="Clear project"
            className="relative size-7 shrink-0 rounded-full hover:bg-transparent dark:hover:bg-transparent"
            onClick={() => onSelect()}
          >
            <ProjectIcon
              icon={project.icon}
              color={project.color}
              className="size-3.5 group-hover/project-picker:invisible group-focus-within/project-picker:invisible"
            />
            <X className="invisible absolute size-3 group-hover/project-picker:visible group-focus-within/project-picker:visible" />
          </Button>
        </ControlTooltip>
      )}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <ControlTooltip label="Change the project for this chat">
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label="Choose project"
                className={`h-7 min-w-0 shrink gap-1.5 rounded-full pr-2 text-xs hover:bg-transparent dark:hover:bg-transparent aria-expanded:bg-transparent ${project ? "pl-0" : "pl-2"}`}
              />
            }
          >
            {!project && <Folder className="size-3.5" />}
            <span className="truncate">
              {project?.name ?? "Choose project"}
            </span>
          </DropdownMenuTrigger>
        </ControlTooltip>
        <DropdownMenuContent
          side="top"
          align="start"
          alignOffset={project ? -28 : 0}
          className="w-64 max-w-[calc(100vw-2rem)]"
        >
          {projects.map((item) => (
            <DropdownMenuItem key={item.id} onClick={() => onSelect(item.id)}>
              <ProjectIcon
                icon={item.icon}
                color={item.color}
                className="size-3.5"
              />
              <span className="truncate">{item.name}</span>
              {item.id === project?.id && <Check className="ml-auto size-3" />}
            </DropdownMenuItem>
          ))}
          {!projects.length && (
            <DropdownMenuItem disabled>No projects</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
