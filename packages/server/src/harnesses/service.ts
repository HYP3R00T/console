import { randomUUID } from "node:crypto";
import {
  BACKGROUND_CONTEXT as context,
  withAbortSignal,
} from "@earendil-works/chord/context";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type {
  Conversation,
  ConversationId,
  Cursor,
  EntryId,
  Harness,
  ModelRef,
  SubmissionId,
} from "@earendil-works/pi-durable";
import { AgentDoc, InboxDoc, LiveDoc } from "@earendil-works/pi-durable";
import { ProjectError, type ProjectService } from "../projects/service.ts";
import type { ProviderService } from "../providers/service.ts";
import {
  AttachmentError,
  type AttachmentInput,
  prepareAttachments,
  readAttachment,
} from "./attachments.ts";
import {
  type ConfigurationChange,
  conversationConfiguration,
} from "./configuration.ts";
import { ConversationArchives } from "./conversation-archives.ts";
import { ConversationInfo, SessionInfo } from "./documents.ts";
import {
  defaultInspectionGuidance,
  defaultWorkspaceGuidance,
} from "./guidance.ts";
import { queueView } from "./queue.ts";
import { HarnessRuntime } from "./runtime.ts";
import {
  type HarnessRecord,
  type HarnessStore,
  standaloneOwner,
} from "./store.ts";

export class HarnessError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
export class HarnessService {
  readonly runtime;
  readonly archives: ConversationArchives;
  private maintaining = new Set<string>();
  readonly store: HarnessStore;
  private projects: ProjectService;
  private providers: ProviderService;
  private closing = false;
  private commands = new Map<string, Promise<unknown>>();
  private tasks = new Set<Promise<unknown>>();
  constructor(
    store: HarnessStore,
    directory: string,
    projects: ProjectService,
    providers: ProviderService,
  ) {
    this.store = store;
    this.archives = new ConversationArchives(store);
    this.projects = projects;
    this.providers = providers;
    this.runtime = new HarnessRuntime(
      directory,
      providers,
      async (sessionId) => {
        const record = store.session(sessionId);
        if (!record || record.projectId === standaloneOwner) return undefined;
        const project = await projects.get(record.projectId);
        if (!project.available)
          throw new HarnessError(409, "Project directory is unavailable.");
        return { id: project.id, name: project.name, directory: project.path };
      },
      undefined,
      {
        projectInstructions: (sessionId) => {
          const projectId = store.session(sessionId)?.projectId;
          return projectId
            ? projects.store.agentSettings(projectId).instructions
            : "";
        },
        workspaceGuidance: () =>
          projects.store.workspaceGuidance() ?? defaultWorkspaceGuidance,
        inspectionGuidance: (sessionId) => {
          const projectId = store.session(sessionId)?.projectId;
          return (
            (projectId &&
              projects.store.agentSettings(projectId).inspectionGuidance) ||
            defaultInspectionGuidance
          );
        },
        compaction: (sessionId) => store.compaction(sessionId),
      },
    );
    projects.afterRegister = (id) =>
      this.operation(() => this.serial(id, () => this.ensureDefault(id)));
    projects.beforeArchive = (id, stop) =>
      this.operation(() => this.prepareArchive(id, stop));
  }
  private async prepareArchive(projectId: string, stop: boolean) {
    // The project gate is already held. Only commands admitted before it can mutate.
    const sessions = this.store.list(projectId);
    await Promise.allSettled([
      this.commands.get(projectId),
      ...sessions.map(({ sessionId }) => this.commands.get(sessionId)),
    ]);
    const harnesses = await Promise.all(
      sessions.map(({ sessionId }) => this.runtime.open(sessionId)),
    );
    const active = async (harness: Harness) => {
      const inspection = await harness.inspect(context);
      return inspection.tasks.length > 0 || inspection.submissions.length > 0;
    };
    const busy = (await Promise.all(harnesses.map(active))).some(Boolean);
    if (busy && !stop)
      throw new ProjectError(
        409,
        "This project has running or queued work.",
        "project_busy",
      );
    if (busy) {
      const deadline = withAbortSignal(AbortSignal.timeout(15000), context);
      const results = await Promise.allSettled(
        harnesses.map((harness) =>
          this.abortConversations(harness, deadline, true),
        ),
      );
      if (
        results.some((result) => result.status === "rejected") ||
        (await Promise.all(harnesses.map(active))).some(Boolean)
      )
        throw new ProjectError(
          409,
          "Some work could not be stopped. The project is still active.",
          "project_busy",
        );
    }
    await Promise.all(harnesses.map((harness) => harness.close(context)));
  }
  // Track admission/read operations too: shutdown cannot close their databases underneath them.
  operation<T>(action: () => Promise<T>): Promise<T> {
    if (this.closing)
      throw new HarnessError(503, "Session service is closing.");
    const task = action().finally(() => this.tasks.delete(task));
    this.tasks.add(task);
    return task;
  }
  async start() {
    await this.runtime.claim();
    for (const project of this.projects.store.list())
      await this.ensureDefault(project.id);
    for (const record of this.store.list()) {
      if (record.projectId === standaloneOwner) {
        (await this.ready(record)).resume();
        continue;
      }
      if (!this.projects.store.get(record.projectId)) continue;
      const project = await this.projects.get(record.projectId);
      if (project.available) (await this.ready(record)).resume();
    }
  }
  private async project(id: string) {
    const project = await this.projects.get(id);
    if (!project.available)
      throw new HarnessError(409, "Project directory is unavailable.");
    return project;
  }
  async list(projectId: string) {
    await this.projects.get(projectId);
    return { sessions: this.store.list(projectId) };
  }
  async listStandalone() {
    const records = await Promise.all(
      this.store.listStandalone().map(async (record) => {
        const { session, conversationId } = await this.standalone(
          record.sessionId,
          true,
        );
        return this.archives.get(record.sessionId, conversationId)
          ? undefined
          : { ...session, conversationId };
      }),
    );
    return { sessions: records.filter((record) => record !== undefined) };
  }
  createStandalone(creationId?: string) {
    return this.serial(`standalone:${creationId ?? randomUUID()}`, async () => {
      const existing = creationId ? this.store.session(creationId) : undefined;
      if (existing && existing.projectId !== standaloneOwner)
        throw new HarnessError(
          409,
          "Creation identity belongs to a project session.",
        );
      const record =
        existing ?? (await this.insertSession(standaloneOwner, creationId));
      if (this.maintaining.has(record.sessionId))
        throw new HarnessError(503, "Session maintenance is in progress.");
      const harness = await this.ready(record);
      const root = await harness.root(context);
      if (this.archives.get(record.sessionId, root.id))
        throw new HarnessError(
          410,
          "The created conversation was archived or deleted.",
        );
      return record;
    });
  }
  async standalone(sessionId: string, includeArchived = false) {
    if (this.maintaining.has(sessionId))
      throw new HarnessError(503, "Session maintenance is in progress.");
    const record = this.store.session(sessionId);
    if (record?.projectId !== standaloneOwner)
      throw new HarnessError(404, "Standalone conversation not found.");
    const harness = await this.ready(record);
    const root = await harness.root(context);
    if (!includeArchived && this.archives.get(sessionId, root.id))
      throw new HarnessError(404, "Conversation is archived or deleted.");
    const info = await harness.snapshot(ConversationInfo, root.id, context);
    return {
      session: { ...record, name: info?.name ?? record.name },
      conversationId: root.id,
    };
  }

  async model(model: ModelRef) {
    const available = await this.providers.favorites();
    const selected = available.models.find(
      (m) => m.provider === model.provider && m.id === model.modelId,
    );
    if (!selected)
      throw new HarnessError(
        409,
        "Choose an available favorite model from an enabled provider.",
      );
    return selected;
  }

  async runtimeDefaults() {
    const { models } = await this.providers.favorites();
    return { ...this.store.runtimeDefaults(), models };
  }

  async updateRuntimeDefaults(
    revision: number,
    defaults: { model: ModelRef; thinkingLevel?: string } | null,
  ) {
    const level = defaults?.thinkingLevel as ModelThinkingLevel | undefined;
    if (defaults) {
      const selected = await this.model(defaults.model);
      if (level !== undefined && !selected.thinkingLevels.includes(level))
        throw new HarnessError(
          400,
          "This thinking level is unavailable for the selected model.",
        );
    }
    if (
      !this.store.setRuntimeDefaults(
        revision,
        defaults && { model: defaults.model, thinkingLevel: level },
      )
    )
      throw new HarnessError(
        409,
        "Defaults changed. Reload settings and try again.",
      );
    return this.store.runtimeDefaults();
  }

  private async availableDefaults() {
    const { defaults } = this.store.runtimeDefaults();
    if (!defaults) return undefined;
    const { models } = await this.providers.favorites();
    const selected = models.find(
      (model) =>
        model.provider === defaults.model.provider &&
        model.id === defaults.model.modelId,
    );
    if (!selected) return undefined;
    return {
      model: defaults.model,
      thinkingLevel:
        defaults.thinkingLevel &&
        selected.thinkingLevels.includes(defaults.thinkingLevel)
          ? defaults.thinkingLevel
          : undefined,
    };
  }

  private async insertSession(
    projectId: string,
    creationId?: string,
    model?: ModelRef,
  ) {
    const defaults = model
      ? { model, thinkingLevel: undefined }
      : await this.availableDefaults();
    if (projectId !== standaloneOwner) this.projects.assertWritable(projectId);
    return this.store.insert(
      projectId,
      defaults?.model.provider,
      defaults?.model.modelId,
      creationId,
      defaults?.thinkingLevel,
    );
  }

  async ensureDefault(projectId: string) {
    this.projects.assertWritable(projectId);
    const project = this.projects.store.get(projectId);
    if (!project) throw new HarnessError(404, "Project not found.");
    const record =
      this.store.list(projectId)[0] ?? (await this.insertSession(projectId));
    await this.initialize(record, project.path);
    return record;
  }
  create(projectId: string, model?: ModelRef) {
    return this.serial(projectId, () => this.createSession(projectId, model));
  }
  private async createSession(projectId: string, model?: ModelRef) {
    const project = await this.project(projectId);
    if (model) await this.model(model);
    await this.ensureDefault(projectId);
    const record = await this.insertSession(projectId, undefined, model);
    await this.initialize(record, project.path);
    return record;
  }
  private async initialize(record: HarnessRecord, cwd: string) {
    const harness = await this.runtime.open(record.sessionId);
    return harness.root(context, {
      agent: {
        model: record.modelId
          ? { provider: record.provider, modelId: record.modelId }
          : undefined,
        thinkingLevel: record.thinkingLevel ?? undefined,
        cwd,
      },
      init: async (tx, id) => {
        const info = await tx.doc(ConversationInfo, id);
        info.name = record.projectId === standaloneOwner ? record.name : "Main";
        const tools =
          record.projectId &&
          this.projects.store.agentSettings(record.projectId).tools;
        if (tools) (await tx.doc(AgentDoc, id)).tools = tools;
      },
    });
  }
  private async ready(record: HarnessRecord) {
    const cwd =
      record.projectId === standaloneOwner
        ? await this.runtime.standaloneWorkspace(record.sessionId)
        : (await this.projects.get(record.projectId)).path;
    await this.initialize(record, cwd);
    return this.runtime.open(record.sessionId);
  }
  async session(sessionId: string) {
    if (this.maintaining.has(sessionId))
      throw new HarnessError(
        503,
        "Session maintenance is in progress. Retry shortly.",
      );
    const record = this.store.session(sessionId);
    if (!record) throw new HarnessError(404, "Session not found.");
    if (record.projectId !== standaloneOwner)
      this.projects.assertWritable(record.projectId);
    const harness = await this.ready(record);
    if (record.projectId !== standaloneOwner)
      this.projects.assertWritable(record.projectId);
    return { record, harness };
  }
  async conversations(sessionId: string) {
    const { record, harness } = await this.session(sessionId);
    const records = await harness.commit(
      (tx) => tx.scanConversations({}, 200),
      context,
    );
    const conversations = await Promise.all(
      records.items.map(async (row) => {
        const info = await harness.snapshot(ConversationInfo, row.id, context);
        return { id: row.id, ...info, name: info?.name ?? "Conversation" };
      }),
    );
    return {
      session: record,
      conversations: conversations.filter(
        (item) => !this.archives.get(sessionId, item.id),
      ),
      more: !!records.next,
    };
  }
  addConversation(sessionId: string, creationId?: string) {
    return this.serial(sessionId, async () => {
      const { record, harness } = await this.session(sessionId);
      if (record.projectId === standaloneOwner)
        throw new HarnessError(
          409,
          "Standalone sessions contain one conversation.",
        );
      if (creationId) {
        const counter = await harness.snapshot(SessionInfo, context);
        const existing = counter?.creations?.[creationId];
        if (existing !== undefined) {
          if (this.archives.get(sessionId, existing))
            throw new HarnessError(
              410,
              "The created conversation was archived or deleted.",
            );
          const info = await harness.snapshot(
            ConversationInfo,
            existing as ConversationId,
            context,
          );
          return { id: existing, name: info?.name ?? "Conversation" };
        }
      }
      const project = await this.project(record.projectId);
      const root = await harness.root(context);
      const agent = await harness.snapshot(AgentDoc, root.id, context);
      const defaults = await this.availableDefaults();
      this.projects.assertWritable(record.projectId);
      let name = "Conversation";
      const conversation = await harness.createConversation(
        {
          ownership: { kind: "ownerless" },
          agent: {
            model: defaults?.model ?? agent?.model,
            thinkingLevel: defaults
              ? defaults.thinkingLevel
              : agent?.thinkingLevel,
            cwd: project.path,
          },
          init: async (tx, id) => {
            const counter = await tx.doc(SessionInfo);
            const info = await tx.doc(ConversationInfo, id);
            name = `Conversation ${counter.nextConversation++}`;
            info.name = name;
            const tools = this.projects.store.agentSettings(
              record.projectId,
            ).tools;
            if (tools) (await tx.doc(AgentDoc, id)).tools = tools;
            if (creationId) {
              counter.creations ??= {};
              counter.creations[creationId] = id;
            }
          },
        },
        context,
      );
      return { id: conversation.id, name };
    });
  }
  async conversation(sessionId: string, id: string) {
    if (this.archives.get(sessionId, Number(id)))
      throw new HarnessError(404, "Conversation is archived or deleted.");
    const { record, harness } = await this.session(sessionId);
    const conversation = await harness.conversation(
      Number(id) as ConversationId,
      context,
    );
    if (!conversation)
      throw new HarnessError(404, "Conversation not found in this session.");
    return { record, harness, conversation };
  }
  private readConfiguration(
    record: HarnessRecord,
    harness: Harness,
    conversation: Conversation,
  ) {
    return conversationConfiguration(
      harness,
      conversation,
      record.projectId
        ? this.projects.store.agentSettings(record.projectId)
        : undefined,
      {
        compaction: this.store.compaction(record.sessionId),
        workspaceGuidance: this.projects.store.workspaceGuidance(),
        projectName: this.projects.store.get(record.projectId)?.name,
        model: (provider, modelId) =>
          this.availableModel({ provider, modelId }),
      },
    );
  }

  configuration(sessionId: string, id: string) {
    return this.serial(sessionId, async () => {
      const { record, harness, conversation } = await this.conversation(
        sessionId,
        id,
      );
      return this.readConfiguration(record, harness, conversation);
    });
  }

  private async assertIdle(harness: Harness, conversationId?: ConversationId) {
    const inspection = await harness.inspect(context);
    if (
      inspection.tasks.some(
        ({ record }) =>
          conversationId === undefined ||
          record.conversationId === conversationId,
      ) ||
      inspection.submissions.some(
        (submission) =>
          conversationId === undefined ||
          submission.conversationId === conversationId,
      )
    )
      throw new HarnessError(
        409,
        conversationId === undefined
          ? "Stop or finish all work in this session first."
          : "Stop or finish this conversation first.",
      );
  }

  configureConversation(
    sessionId: string,
    id: string,
    change: ConfigurationChange,
  ) {
    return this.serial(sessionId, async () => {
      const { record, harness, conversation } = await this.conversation(
        sessionId,
        id,
      );
      const projectChange =
        change.projectTools !== undefined ||
        change.projectInstructions !== undefined ||
        change.inspectionGuidance !== undefined;
      const conversationChange =
        change.tools !== undefined || change.instructions !== undefined;
      const sessionChange =
        change.keepRecentTokens !== undefined ||
        change.automaticCompaction !== undefined;
      const machineChange = change.workspaceGuidance !== undefined;
      if (
        Number(projectChange) +
          Number(conversationChange) +
          Number(sessionChange) +
          Number(machineChange) !==
        1
      )
        throw new HarnessError(
          400,
          "Change one configuration scope at a time.",
        );
      if (!projectChange && !machineChange)
        await this.assertIdle(
          harness,
          sessionChange ? undefined : conversation.id,
        );
      const current = await this.readConfiguration(
        record,
        harness,
        conversation,
      );
      if (current.revision !== change.revision)
        throw new HarnessError(
          409,
          "Configuration changed. Refresh and retry.",
        );

      const selected = projectChange ? change.projectTools : change.tools;
      if (
        selected &&
        (new Set(selected).size !== selected.length ||
          selected.some(
            (name) => !current.tools.some((tool) => tool.name === name),
          ))
      )
        throw new HarnessError(400, "Unknown or duplicate tool.");

      if (change.workspaceGuidance !== undefined) {
        const workspace = current.guidance?.workspace;
        const stored = this.projects.store.workspaceGuidance();
        if (stored !== (workspace?.customized ? workspace.text : null))
          throw new HarnessError(
            409,
            "Workspace guidance changed. Refresh and retry.",
          );
        this.projects.store.setWorkspaceGuidance(
          change.workspaceGuidance?.trim() || null,
        );
      } else if (projectChange) {
        if (!current.project)
          throw new HarnessError(400, "This conversation has no project.");
        this.projects.assertWritable(record.projectId);
        // Other sessions can write the same project while the catalog is being read.
        if (
          JSON.stringify(
            this.projects.store.agentSettings(record.projectId),
          ) !== JSON.stringify(current.project)
        )
          throw new HarnessError(
            409,
            "Project configuration changed. Refresh and retry.",
          );
        this.projects.store.setAgentSettings(record.projectId, {
          ...current.project,
          ...(change.inspectionGuidance !== undefined && {
            inspectionGuidance: change.inspectionGuidance?.trim() || null,
          }),
          tools:
            change.projectTools === undefined
              ? current.project.tools
              : change.projectTools,
          instructions:
            change.projectInstructions === undefined
              ? current.project.instructions
              : (change.projectInstructions?.trim() ?? ""),
        });
      } else if (sessionChange) {
        const { min, max, step } = current.context;
        const tokens =
          change.keepRecentTokens ?? current.context.keepRecentTokens;
        if (tokens < min || tokens > max || tokens % step !== 0)
          throw new HarnessError(400, "Invalid recent context size.");
        this.store.setCompaction(
          sessionId,
          tokens,
          change.automaticCompaction ?? current.context.automatic,
        );
      } else {
        const agent = await conversation.agent(context);
        const catalog = agent.extensions.flatMap(
          (extension) => extension.tools ?? [],
        );
        await conversation.configure(
          {
            tools:
              selected == null
                ? selected
                : catalog.filter((tool) => selected.includes(tool.name)),
            instructions:
              change.instructions === undefined
                ? undefined
                : change.instructions?.trim() || null,
          },
          context,
        );
      }
      return this.readConfiguration(record, harness, conversation);
    });
  }

  private availableModel(model: ModelRef) {
    return this.providers.store.enabled(model.provider)
      ? this.providers.models.getModel(model.provider, model.modelId)
      : undefined;
  }

  compactConversation(sessionId: string, id: string, focus?: string) {
    return this.serial(sessionId, async () => {
      const { harness, conversation } = await this.conversation(sessionId, id);
      await this.assertIdle(harness, conversation.id);
      const agent = await conversation.agent(context);
      if (!agent.model)
        throw new HarnessError(
          409,
          "Send a message with a model before compacting.",
        );
      if (!this.availableModel(agent.model))
        throw new HarnessError(409, "The conversation model is unavailable.");
      const taskId = await conversation.compact(
        focus?.trim() || undefined,
        context,
      );
      return { taskId };
    });
  }
  async archivedConversations() {
    return {
      conversations: this.archives.list().map((item) => {
        const session = this.store.session(item.sessionId);
        const project = session?.projectId
          ? [
              ...this.projects.store.list(),
              ...this.projects.store.list(true),
            ].find((project) => project.id === session.projectId)
          : undefined;
        return {
          ...item,
          projectId: session?.projectId || null,
          projectName: project?.name ?? null,
          projectArchived: !!project?.archivedAt,
        };
      }),
    };
  }
  archiveConversation(sessionId: string, id: string, stop: boolean) {
    return this.serial(sessionId, async () => {
      const existing = this.archives.get(sessionId, Number(id));
      if (existing && !existing.deletedAt) return { archived: true };
      const { harness, conversation } = await this.conversation(sessionId, id);
      const live = await harness.snapshot(LiveDoc, conversation.id, context);
      const inbox = await harness.snapshot(InboxDoc, conversation.id, context);
      const inspection = await harness.inspect(context);
      const busy =
        !!live?.run ||
        !!inbox?.items.length ||
        inspection.tasks.some(
          (task) => task.record.conversationId === conversation.id,
        );
      if (busy && !stop)
        throw new HarnessError(
          409,
          "Conversation has running or queued work. Stop and archive to continue.",
        );
      await conversation.abort(
        withAbortSignal(AbortSignal.timeout(15000), context),
        { background: true },
      );
      const info = await harness.snapshot(
        ConversationInfo,
        conversation.id,
        context,
      );
      this.archives.archive(
        sessionId,
        conversation.id,
        info?.name ?? "Conversation",
      );
      await harness.commit(async (tx) => {
        const info = await tx.doc(ConversationInfo, conversation.id);
        info.archived = true;
      }, context);
      return { archived: true };
    });
  }
  restoreConversation(sessionId: string, id: string) {
    return this.serial(sessionId, async () => {
      const item = this.archives.get(sessionId, Number(id));
      if (!item || item.deletedAt)
        throw new HarnessError(404, "Archived conversation not found.");
      const { harness } = await this.session(sessionId); // Restore the project first.
      await harness.commit(async (tx) => {
        const info = await tx.doc(
          ConversationInfo,
          Number(id) as ConversationId,
        );
        info.archived = false;
      }, context);
      this.archives.restore(sessionId, Number(id));
      return { restored: true };
    });
  }
  deleteArchivedConversation(sessionId: string, id: string) {
    return this.serial(sessionId, async () => {
      const item = this.archives.get(sessionId, Number(id));
      if (!item || (item.deletedAt && item.deletedAt !== "pending"))
        throw new HarnessError(404, "Archived conversation not found.");
      const record = this.store.session(sessionId);
      if (!record) throw new HarnessError(404, "Session not found.");
      this.maintaining.add(sessionId);
      try {
        await this.runtime.purge(sessionId, Number(id), () =>
          this.archives.deleting(sessionId, Number(id)),
        );
        this.archives.deleted(sessionId, Number(id));
      } catch (error) {
        throw new HarnessError(
          409,
          error instanceof Error
            ? error.message
            : "History could not be deleted.",
        );
      } finally {
        this.maintaining.delete(sessionId);
      }
      return { deleted: true };
    });
  }
  renameConversation(sessionId: string, id: string, name: string) {
    return this.serial(sessionId, async () => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 120)
        throw new HarnessError(
          400,
          "Use a conversation name between 1 and 120 characters.",
        );
      const { record, harness, conversation } = await this.conversation(
        sessionId,
        id,
      );
      if (record.projectId !== standaloneOwner)
        this.projects.assertWritable(record.projectId);
      await harness.commit(async (tx) => {
        const info = await tx.doc(ConversationInfo, conversation.id);
        info.name = trimmed;
      }, context);
      return { id: conversation.id, name: trimmed };
    });
  }
  private async admit(
    sessionId: string,
    id: string,
    content: string,
    requestId: string,
    selection?: {
      model?: ModelRef;
      thinkingLevel?: string;
      whenBusy?: "steer" | "followUp";
      attachments?: AttachmentInput[];
    },
  ) {
    const { record, harness, conversation } = await this.conversation(
      sessionId,
      id,
    );
    const existing = await harness.commit(
      (tx) => tx.submissionByRequest(conversation.id, requestId),
      context,
    );
    if (existing) {
      await this.rememberSubmission(harness, conversation.id, existing.id);
      return existing;
    }
    if (record.projectId !== standaloneOwner)
      await this.project(record.projectId);
    const agent = await conversation.agent(context);
    const model = selection?.model ?? agent.model;
    if (!model) throw new HarnessError(409, "Choose a model before sending.");
    const metadata = await this.model(model);
    const thinkingLevel = selection?.thinkingLevel;
    if (
      thinkingLevel !== undefined &&
      !metadata.thinkingLevels.includes(thinkingLevel as ModelThinkingLevel)
    )
      throw new HarnessError(
        400,
        "This thinking level is unavailable for the selected model.",
      );
    const files = selection?.attachments ?? [];
    if (!content.trim() && !files.length)
      throw new AttachmentError("Write a message or attach a file.");
    const attached = files.length
      ? await prepareAttachments(
          content,
          files,
          metadata.input.includes("image"),
        )
      : undefined;
    const changedModel =
      model.provider !== agent.model?.provider ||
      model.modelId !== agent.model?.modelId;
    const changedThinking =
      thinkingLevel !== undefined && thinkingLevel !== agent.thinkingLevel;
    if (changedModel || changedThinking) {
      const live = await harness.snapshot(LiveDoc, conversation.id, context);
      const inbox = await harness.snapshot(InboxDoc, conversation.id, context);
      if (live?.run || inbox?.items.length)
        throw new HarnessError(
          409,
          "Wait until this conversation is idle before changing its model or thinking level.",
        );
      await conversation.configure(
        {
          model,
          thinkingLevel:
            (thinkingLevel as ModelThinkingLevel | undefined) ??
            (changedModel ? null : undefined),
        },
        context,
      );
    }
    const submission = await conversation.submit(
      {
        type: "input",
        whenBusy: selection?.whenBusy ?? "followUp",
        content: attached?.blocks ?? content,
        requestId,
        ...(attached
          ? {
              entry: {
                kind: "console.input",
                data: { text: content, attachments: attached.info },
              },
            }
          : {}),
      },
      context,
    );
    await this.rememberSubmission(harness, conversation.id, submission.id);
    return submission.status(context);
  }
  private serial<T>(sessionId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.commands.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    this.commands.set(sessionId, next);
    void next
      .finally(() => {
        if (this.commands.get(sessionId) === next)
          this.commands.delete(sessionId);
      })
      .catch(() => {});
    return next;
  }
  submit(
    sessionId: string,
    id: string,
    content: string,
    requestId: string,
    selection?: {
      model?: ModelRef;
      thinkingLevel?: string;
      whenBusy?: "steer" | "followUp";
      attachments?: AttachmentInput[];
    },
  ) {
    return this.serial(sessionId, () =>
      this.admit(sessionId, id, content, requestId, selection),
    );
  }
  async attachment(
    sessionId: string,
    id: string,
    entryId: string,
    index: number,
  ) {
    const { harness, conversation } = await this.conversation(sessionId, id);
    const entry = await harness.commit(
      (tx) => tx.entry(Number(entryId) as EntryId),
      context,
    );
    if (!entry || entry.conversationId !== conversation.id)
      throw new HarnessError(404, "Attachment not found in this conversation.");
    const file = readAttachment(entry, index);
    if (!file) throw new HarnessError(404, "Attachment not found.");
    return file;
  }
  async queue(sessionId: string, id: string) {
    const { harness, conversation } = await this.conversation(sessionId, id);
    const inbox = await harness.snapshot(InboxDoc, conversation.id, context);
    return queueView(inbox?.items ?? []);
  }
  updateQueued(
    sessionId: string,
    id: string,
    submissionId: string,
    change: {
      content: string;
      whenBusy: "steer" | "followUp";
      expectedContent: string;
      expectedWhenBusy: "steer" | "followUp";
    },
  ) {
    return this.serial(sessionId, async () => {
      const { record, harness, conversation } = await this.conversation(
        sessionId,
        id,
      );
      if (record.projectId !== standaloneOwner)
        this.projects.assertWritable(record.projectId);
      await harness.commit(async (tx) => {
        const inbox = await tx.doc(InboxDoc, conversation.id);
        const item = inbox.items.find(
          (item) => item.id === Number(submissionId),
        );
        if (!item || item.mode === "write")
          throw new HarnessError(
            409,
            "This input has already started or left the queue.",
          );
        const before = queueView([item])[0];
        if (
          before.content !== change.expectedContent ||
          before.whenBusy !== change.expectedWhenBusy
        )
          throw new HarnessError(
            409,
            "This queued input changed. Refresh before editing it.",
          );
        if (!change.content.trim() && !before.attachments.length)
          throw new HarnessError(400, "Write a message or keep an attachment.");
        if (typeof item.content === "string") item.content = change.content;
        else {
          const first = item.content[0];
          if (first?.type !== "text")
            throw new HarnessError(409, "This input cannot be edited here.");
          first.text = change.content;
        }
        if (
          item.entry?.kind === "console.input" &&
          item.entry.data &&
          typeof item.entry.data === "object" &&
          !Array.isArray(item.entry.data)
        )
          item.entry.data.text = change.content;
        item.mode = change.whenBusy;
      }, context);
      return { updated: true };
    });
  }
  withdrawQueued(sessionId: string, id: string, submissionId: string) {
    return this.serial(sessionId, async () => {
      const { record, harness, conversation } = await this.conversation(
        sessionId,
        id,
      );
      if (record.projectId !== standaloneOwner)
        this.projects.assertWritable(record.projectId);
      const outcome = await harness.abortSubmission(
        Number(submissionId) as SubmissionId,
        context,
        conversation.id,
      );
      if (outcome === "not_found")
        throw new HarnessError(404, "Queued input not found.");
      if (outcome === "already_placed")
        throw new HarnessError(409, "This input has already started.");
      return { withdrawn: true };
    });
  }
  stopConversation(sessionId: string, id: string) {
    return this.serial(sessionId, async () => {
      const { record, conversation } = await this.conversation(sessionId, id);
      if (record.projectId !== standaloneOwner)
        this.projects.assertWritable(record.projectId);
      await conversation.abort(context);
      return { stopped: true };
    });
  }
  stop(sessionId: string) {
    return this.serial(sessionId, async () => {
      const { harness } = await this.session(sessionId);
      await this.abortConversations(harness, context);
      return { stopped: true };
    });
  }
  private async abortConversations(
    harness: Harness,
    operationContext: typeof context,
    background = false,
  ) {
    let cursor: Cursor | undefined;
    do {
      const page = await harness.commit(
        (tx) => tx.scanConversations({}, 200, cursor),
        operationContext,
      );
      const results = await Promise.allSettled(
        page.items.map(async (row) => {
          const conversation = await harness.conversation(
            row.id,
            operationContext,
          );
          await conversation?.abort(operationContext, { background });
        }),
      );
      for (const result of results)
        if (result.status === "rejected") throw result.reason;
      cursor = page.next;
    } while (cursor);
  }
  async submission(sessionId: string, id: string, submissionId: string) {
    const { harness } = await this.conversation(sessionId, id);
    const submission = await harness.submission(
      Number(submissionId) as SubmissionId,
      context,
    );
    const record = await submission?.status(context);
    if (!record || record.conversationId !== Number(id))
      throw new HarnessError(404, "Submission not found.");
    return record;
  }
  async latestSubmission(sessionId: string, id: string) {
    const { harness, conversation } = await this.conversation(sessionId, id);
    const info = await harness.snapshot(
      ConversationInfo,
      conversation.id,
      context,
    );
    const submission =
      info?.lastSubmissionId === undefined
        ? undefined
        : await harness.submission(
            info.lastSubmissionId as SubmissionId,
            context,
          );
    return submission?.status(context);
  }
  private async rememberSubmission(
    harness: import("@earendil-works/pi-durable").Harness,
    conversationId: ConversationId,
    id: SubmissionId,
  ) {
    await harness.commit(async (tx) => {
      const info = await tx.doc(ConversationInfo, conversationId);
      if (info.lastSubmissionId === undefined || info.lastSubmissionId < id)
        info.lastSubmissionId = id;
    }, context);
  }

  async history(
    sessionId: string,
    id: string,
    cursor?: Cursor,
    before?: number,
    limit = 50,
  ) {
    const { conversation } = await this.conversation(sessionId, id);
    return conversation.entries(
      before === undefined ? {} : { maxEntryId: (before - 1) as EntryId },
      limit,
      cursor,
      context,
    );
  }
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.tasks]);
    try {
      await this.runtime.close();
    } finally {
      this.store.close();
    }
  }
}
