"use client";
import {
  BookOpen,
  Bot,
  Box,
  Briefcase,
  Camera,
  Code,
  Coffee,
  Compass,
  Cpu,
  Database,
  FlaskConical,
  Folder,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  Layers,
  Leaf,
  Lightbulb,
  Music,
  NotebookPen,
  Palette,
  PenTool,
  Puzzle,
  Rocket,
  Server,
  Shield,
  Sparkles,
  Terminal,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const icons = {
  folder: Folder,
  code: Code,
  terminal: Terminal,
  book: BookOpen,
  flask: FlaskConical,
  rocket: Rocket,
  briefcase: Briefcase,
  palette: Palette,
  cpu: Cpu,
  database: Database,
  globe: Globe,
  server: Server,
  layers: Layers,
  lightbulb: Lightbulb,
  music: Music,
  camera: Camera,
  "pen-tool": PenTool,
  "graduation-cap": GraduationCap,
  heart: Heart,
  shield: Shield,
  wrench: Wrench,
  box: Box,
  bot: Bot,
  compass: Compass,
  gamepad: Gamepad2,
  leaf: Leaf,
  coffee: Coffee,
  notebook: NotebookPen,
  puzzle: Puzzle,
  workflow: Workflow,
  sparkles: Sparkles,
  zap: Zap,
};
const colors = {
  neutral: "text-muted-foreground",
  red: "text-red-400",
  orange: "text-orange-400",
  amber: "text-amber-400",
  green: "text-green-400",
  blue: "text-blue-400",
  purple: "text-purple-400",
  pink: "text-pink-400",
};
export function ProjectIcon({
  icon,
  color,
  className,
}: {
  icon: string;
  color: string;
  className?: string;
}) {
  const Icon = icons[icon as keyof typeof icons] ?? Folder;
  return (
    <Icon
      className={cn(
        "size-4 shrink-0",
        colors[color as keyof typeof colors] ?? colors.neutral,
        className,
      )}
    />
  );
}
export function ProjectIconPicker({
  icon,
  color,
  onChange,
  disabled = false,
}: {
  icon: string;
  color: string;
  onChange: (icon: string, color: string) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const visibleIcons = Object.keys(icons).filter((id) =>
    id.replaceAll("-", " ").includes(search.trim().toLowerCase()),
  );
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            disabled={disabled}
            aria-label="Choose project icon"
          />
        }
      >
        <ProjectIcon icon={icon} color={color} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] gap-4 p-4"
      >
        <PopoverTitle>Project icon</PopoverTitle>
        <div className="grid grid-cols-8 gap-1">
          {Object.entries(colors).map(([id, style]) => (
            <Button
              key={id}
              disabled={disabled}
              variant="ghost"
              size="icon"
              className={cn("size-7", style)}
              aria-label={`${id} color`}
              aria-pressed={color === id}
              onClick={() => onChange(icon, id)}
            >
              <span
                className={cn(
                  "size-4 bg-current",
                  color === id &&
                    "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                )}
              />
            </Button>
          ))}
        </div>
        <Input
          disabled={disabled}
          aria-label="Search project icons"
          placeholder="Search icons"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="border-0 bg-muted/40 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        />
        <div className="grid grid-cols-8 gap-1">
          {visibleIcons.map((id) => (
            <Button
              key={id}
              disabled={disabled}
              variant="ghost"
              size="icon"
              className={cn("w-full", icon === id && "bg-accent")}
              aria-label={`${id} icon`}
              title={id.replaceAll("-", " ")}
              aria-pressed={icon === id}
              onClick={() => onChange(id, color)}
            >
              <ProjectIcon icon={id} color={color} />
            </Button>
          ))}
        </div>
        {!visibleIcons.length && (
          <p className="text-xs text-muted-foreground">No matching icons</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
