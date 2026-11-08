"use client";
import { ProjectPage } from "@/components/projects/project-page";
import { ScopedSettings } from "@/components/settings/scoped-settings";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type InspectorScope,
  type InspectorSection,
  type InspectorSelection,
  inspectorScopes,
} from "@/lib/inspector-preferences";
import {
  ConversationInspector,
  type ConversationInspectorProps,
} from "./conversation-inspector";

export function WorkspaceInspector({
  deviceId,
  sessionId,
  conversationId,
  projectId,
  selection,
  onScopeChange,
  onSectionChange,
  storageError,
  ...conversation
}: Omit<
  ConversationInspectorProps,
  "section" | "onSectionChange" | "onScopeChange" | "embedded"
> & {
  deviceId: string;
  sessionId: string;
  conversationId: string;
  selection: InspectorSelection;
  onScopeChange: (scope: InspectorScope) => void;
  onSectionChange: (section: InspectorSection) => void;
  storageError?: boolean;
}) {
  const target = { deviceId, sessionId, projectId };
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <Tabs
        value={selection.scope}
        onValueChange={(value) => {
          if (inspectorScopes.includes(value as InspectorScope))
            onScopeChange(value as InspectorScope);
        }}
        className="min-h-0 flex-1"
      >
        <TabsList aria-label="Configuration scope" className="w-full shrink-0">
          {projectId && <TabsTrigger value="project">Project</TabsTrigger>}
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="conversation">Conversation</TabsTrigger>
        </TabsList>
        {projectId && (
          <TabsContent value="project" keepMounted className="min-h-0">
            <ScrollArea className="h-full">
              <div className="flex min-w-0 flex-col gap-5 px-1 py-2 pr-3">
                <p className="text-xs text-muted-foreground">
                  Shared across every session and conversation in this project.
                  Tool defaults affect new conversations only.
                </p>
                <ProjectPage settings projectId={projectId} />
                <ScopedSettings scope="project" target={target} embedded />
              </div>
            </ScrollArea>
          </TabsContent>
        )}
        <TabsContent value="session" keepMounted className="min-h-0">
          <ScrollArea className="h-full">
            <div className="px-1 py-2 pr-3">
              <ScopedSettings scope="session" target={target} embedded />
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="conversation" keepMounted className="min-h-0">
          <div className="flex h-full min-h-0 flex-col gap-2">
            <p className="px-1 text-xs text-muted-foreground">
              Conversation {conversationId} · changes below apply to this agent.
              Shared controls identify their broader scope.
            </p>
            <ConversationInspector
              {...conversation}
              projectId={projectId}
              embedded
              active={selection.scope === "conversation"}
              section={selection.section}
              onSectionChange={onSectionChange}
              onScopeChange={onScopeChange}
            />
          </div>
        </TabsContent>
      </Tabs>
      {storageError && (
        <p role="alert" className="text-xs text-destructive">
          Browser storage is unavailable. The last inspector selection may not
          survive a reload.
        </p>
      )}
    </div>
  );
}
