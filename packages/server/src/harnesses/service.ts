import { randomUUID } from "node:crypto";
import { copyJson } from "@earendil-works/chord";
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
  TaskId,
} from "@earendil-works/pi-durable";
import {
  AgentDoc,
  configure,
  InboxDoc,
  LiveDoc,
  type RunFailureReason,
} from "@earendil-works/pi-durable";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { RemoteWorkspaceDoc } from "../execution/remote-workspaces.ts";
import { SandboxDoc } from "../execution/sandbox.ts";
import { linkedWorktreePath } from "../projects/git-metadata.ts";
import { ProjectError, type ProjectService } from "../projects/service.ts";
import type { ProviderService } from "../providers/service.ts";
import { selectAdvancedTools, selectExtensionTools } from "./advanced-tools.ts";
import {
  AttachmentError,
  type AttachmentInput,
  prepareAttachments,
  readAttachment,
} from "./attachments.ts";
import { BackgroundReview, ReviewRequests } from "./background-review.ts";
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
import { mcpExtensionName } from "./mcp-tools.ts";
import { PlanDoc, PlanExtension } from "./plan.ts";
import { PostRunDoc } from "./post-run.ts";
import { queueView } from "./queue.ts";
import { ReviewExtension, ReviewerAgent } from "./reviewer.ts";
import { HarnessRuntime } from "./runtime.ts";
import {
  type HarnessRecord,
  type HarnessStore,
  standaloneOwner,
} from "./store.ts";
import { budgetReached, exceedsBudget } from "./token-budget.ts";

export function canContinue(reason: RunFailureReason) {
  return (
    reason === "turn_limit" ||
    reason === "interrupted" ||
    reason === "restart_limit" ||
    reason === "model_error"
  );
}

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
        tokenBudget: (sessionId) => store.tokenBudget(sessionId),
        worktree: (sessionId, id) => store.worktree(sessionId, id),
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
    const records = await harness.commit(async (tx) => {
      const visible = [];
      let cursor: Cursor | undefined;
      do {
        const page = await tx.scanConversations({}, 200, cursor);
        visible.push(...page.items.filter((item) => !item.owner));
        cursor = page.next;
      } while (cursor && visible.length <= 200);
      return { items: visible.slice(0, 200), more: visible.length > 200 };
    }, context);
    const conversations = await Promise.all(
      records.items.map(async (row) => {
        const info = await harness.snapshot(ConversationInfo, row.id, context);
        return {
          id: row.id,
          ...info,
          name: info?.name ?? "Conversation",
          parent: row.parent,
        };
      }),
    );
    return {
      session: record,
      conversations: conversations.filter(
        (item) => !this.archives.get(sessionId, item.id),
      ),
      more: records.more,
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
  forkConversation(
    sessionId: string,
    id: string,
    at: number,
    creationId: string,
  ) {
    return this.serial(sessionId, async () => {
      const { record, conversation } = await this.conversation(sessionId, id);
      if (record.projectId === standaloneOwner)
        throw new HarnessError(409, "Forks are available in project sessions.");
      const entryId = at as EntryId;
      const key = `fork:${conversation.id}:${entryId}:${creationId}`;
      this.projects.assertWritable(record.projectId);
      return conversation.commit(async (tx) => {
        const counter = await tx.doc(SessionInfo);
        const existing = counter.creations?.[key];
        if (existing !== undefined) {
          if (this.archives.get(sessionId, existing))
            throw new HarnessError(410, "The fork was archived or deleted.");
          const info = await tx.doc(
            ConversationInfo,
            existing as ConversationId,
          );
          return { id: existing, name: info.name };
        }
        const { items } = await tx.scanEntries(
          {
            conversationId: conversation.id,
            minEntryId: entryId,
            maxEntryId: entryId,
          },
          1,
        );
        if (!items.length)
          throw new HarnessError(
            404,
            "Fork point not found in this conversation.",
          );
        const fork = await tx.forkConversation(conversation.id, entryId, {
          ownership: { kind: "ownerless" },
        });
        const info = await tx.doc(ConversationInfo, fork.id);
        info.name = `Conversation ${counter.nextConversation++}`;
        info.createdAt = new Date().toISOString();
        delete info.lastSubmissionId;
        delete info.archived;
        counter.creations ??= {};
        counter.creations[key] = fork.id;
        return { id: fork.id, name: info.name };
      }, context);
    });
  }
  async conversation(sessionId: string, id: string) {
    if (this.archives.get(sessionId, Number(id)))
      throw new HarnessError(404, "Conversation is archived or deleted.");
    const { record, harness } = await this.session(sessionId);
    const conversationId = Number(id) as ConversationId;
    const row = await harness.commit(
      (tx) => tx.conversation(conversationId),
      context,
    );
    const conversation =
      row && !row.owner
        ? await harness.conversation(conversationId, context)
        : undefined;
    if (!conversation)
      throw new HarnessError(404, "Conversation not found in this session.");
    return { record, harness, conversation };
  }

  async review(sessionId: string, id: string, reviewId: string) {
    const { harness, conversation } = await this.conversation(sessionId, id);
    const childId = Number(reviewId) as ConversationId;
    const child = await harness.commit(
      (tx) => tx.conversation(childId),
      context,
    );
    if (child?.owner?.conversationId !== conversation.id)
      throw new HarnessError(404, "Review not found in this conversation.");
    const agent = await harness.snapshot(AgentDoc, childId, context);
    if (
      !Array.isArray(agent?.extensions) ||
      !agent.extensions.includes(ReviewerAgent.name)
    )
      throw new HarnessError(404, "Review not found in this conversation.");
    const review = await harness.conversation(childId, context);
    if (!review) throw new HarnessError(404, "Review not found.");
    return review;
  }

  async worktrees(sessionId: string, id: string) {
    const { record } = await this.conversation(sessionId, id);
    if (!record.projectId) return { worktrees: [] };
    const git = await this.projects.gitMetadata(record.projectId);
    if (git.status !== "repository" || !git.root) return { worktrees: [] };
    return {
      worktrees: git.worktrees
        .slice(1)
        .filter(
          (tree) => tree.path !== git.root && !tree.prunable && !tree.bare,
        )
        .map(({ path, branch }) => ({ path, branch })),
    };
  }

  scheduleReview(
    sessionId: string,
    id: string,
    brief: string,
    requestId: string,
    at?: number,
  ) {
    return this.serial(sessionId, async () => {
      const { harness, conversation } = await this.conversation(sessionId, id);
      const agent = await conversation.agent(context);
      const taskId = await conversation.commit(async (tx) => {
        const request = await tx.doc(
          ReviewRequests,
          conversation.id,
          requestId,
          null,
        );
        if (request.taskId !== undefined) return request.taskId;
        const trimmed = brief.trim();
        if (!trimmed) throw new HarnessError(400, "Provide a review brief.");
        if (!agent.model || !this.availableModel(agent.model))
          throw new HarnessError(
            409,
            "Choose an available conversation model before scheduling a review.",
          );
        const id = await tx.createTask(
          BackgroundReview,
          {
            brief: trimmed,
            at: at ?? Date.now(),
            model: agent.model,
            thinkingLevel: agent.thinkingLevel ?? null,
          },
          { ownership: { kind: "conversation" }, background: true },
        );
        request.taskId = id;
        return id;
      }, context);
      harness.resume();
      return { id: taskId };
    });
  }

  stopReview(sessionId: string, id: string, taskId: string) {
    return this.serial(sessionId, async () => {
      const { harness, conversation } = await this.conversation(sessionId, id);
      const task = await harness.commit(
        (tx) => tx.task(Number(taskId) as TaskId),
        context,
      );
      if (
        task?.conversationId !== conversation.id ||
        task.kind !== BackgroundReview.definition.name
      )
        throw new HarnessError(
          404,
          "Background review not found in this conversation.",
        );
      await harness.abortTask(task.id, context);
      return { stopped: true };
    });
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
        tokenBudget: this.store.tokenBudget(record.sessionId),
        mcp: this.runtime.mcp.status(),
        remote: this.runtime.remote.status(),
        worktree: record.projectId
          ? this.store.worktree(record.sessionId, conversation.id)
          : undefined,
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
        change.tools !== undefined ||
        change.instructions !== undefined ||
        change.maxTurns !== undefined ||
        change.planMode !== undefined ||
        change.postRunCommand !== undefined ||
        change.worktree !== undefined ||
        change.sandbox !== undefined ||
        change.remoteProfile !== undefined ||
        change.codeMode !== undefined ||
        change.mcp !== undefined;
      const compactionChange =
        change.keepRecentTokens !== undefined ||
        change.automaticCompaction !== undefined;
      const sessionChange =
        compactionChange || change.tokenBudget !== undefined;
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
      if (conversationChange || compactionChange)
        await this.assertIdle(
          harness,
          sessionChange || change.remoteProfile !== undefined
            ? undefined
            : conversation.id,
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
      if (
        change.tools !== undefined &&
        (current.plan.active || change.planMode !== undefined)
      )
        throw new HarnessError(409, "Exit Plan mode before changing tools.");
      if (change.codeMode !== undefined) {
        if (current.plan.active || change.planMode !== undefined)
          throw new HarnessError(
            409,
            "Exit Plan mode before changing Code Mode.",
          );
        if (change.tools !== undefined)
          throw new HarnessError(
            400,
            "Change Code Mode separately from the tool selection.",
          );
      }
      if (change.mcp !== undefined) {
        if (current.plan.active || change.planMode !== undefined)
          throw new HarnessError(
            409,
            "Exit Plan mode before changing MCP access.",
          );
        if (
          change.tools !== undefined ||
          change.codeMode !== undefined ||
          change.sandbox !== undefined
        )
          throw new HarnessError(
            400,
            "Change MCP access separately from other tool settings.",
          );
        if (change.mcp && (current.sandbox || current.remote?.profile))
          throw new HarnessError(
            409,
            "Use local execution without a workspace sandbox before enabling host MCP tools.",
          );
        if (
          change.mcp &&
          !current.mcp?.servers.some(
            (server) => server.connected && server.tools > 0,
          )
        )
          throw new HarnessError(
            409,
            "No configured MCP server has tools available.",
          );
      }
      if (change.sandbox && (current.mcpEnabled || current.mcpSuspended))
        throw new HarnessError(
          409,
          "Disable host MCP access before enabling the workspace sandbox.",
        );
      if (current.remote?.profile && (change.sandbox || change.worktree))
        throw new HarnessError(
          409,
          "Return to local execution before enabling a sandbox or attaching a worktree.",
        );
      if (change.remoteProfile !== undefined) {
        if (
          change.tools !== undefined ||
          change.instructions !== undefined ||
          change.maxTurns !== undefined ||
          change.planMode !== undefined ||
          change.postRunCommand !== undefined ||
          change.worktree !== undefined ||
          change.sandbox !== undefined ||
          change.codeMode !== undefined ||
          change.mcp !== undefined
        )
          throw new HarnessError(
            400,
            "Change the execution destination separately.",
          );
        if (change.remoteProfile) {
          if (
            current.worktree ||
            current.sandbox ||
            current.mcpEnabled ||
            current.mcpSuspended
          )
            throw new HarnessError(
              409,
              "Detach the worktree and disable the workspace sandbox and host MCP access before selecting an SSH profile.",
            );
          try {
            await this.runtime.remote.environment(
              change.remoteProfile,
              context,
            );
          } catch (error) {
            throw new HarnessError(409, (error as Error).message);
          }
        }
      }

      const selected = projectChange ? change.projectTools : change.tools;
      if (
        selected &&
        (new Set(selected).size !== selected.length ||
          selected.some(
            (name) =>
              !(
                projectChange
                  ? [
                      ...(CodingTools.tools ?? []),
                      ...(ReviewExtension.tools ?? []),
                    ]
                  : current.tools
              )?.some((tool) => tool.name === name),
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
        if (compactionChange) {
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
        }
        if (change.tokenBudget !== undefined)
          this.store.setTokenBudget(sessionId, change.tokenBudget);
      } else {
        if (change.worktree !== undefined) {
          if (record.projectId === standaloneOwner)
            throw new HarnessError(
              409,
              "Only project conversations can attach a Git worktree.",
            );
          if (
            change.tools !== undefined ||
            change.instructions !== undefined ||
            change.planMode !== undefined ||
            change.sandbox !== undefined ||
            change.codeMode !== undefined ||
            change.mcp !== undefined ||
            change.maxTurns !== undefined ||
            change.postRunCommand !== undefined
          )
            throw new HarnessError(
              400,
              "Change the workspace separately from other conversation settings.",
            );
          const project = await this.project(record.projectId);
          const path =
            change.worktree === null
              ? null
              : await linkedWorktreePath(project.path, change.worktree);
          if (path === undefined)
            throw new HarnessError(
              400,
              "Choose an existing linked worktree of this project.",
            );
          this.projects.assertWritable(record.projectId);
          if (current.sandbox)
            await this.probeSandbox(path ?? project.path, false);
          if (!this.store.setWorktree(sessionId, conversation.id, path))
            throw new HarnessError(
              409,
              "This worktree is assigned to another conversation.",
            );
          this.runtime.releaseSandbox(sessionId, conversation.id);
          return this.readConfiguration(record, harness, conversation);
        }
        if (change.sandbox && !current.sandbox) {
          const standalone = record.projectId === standaloneOwner;
          let directory: string;
          if (standalone)
            directory = await this.runtime.standaloneWorkspace(sessionId);
          else {
            const project = await this.project(record.projectId);
            const assigned = this.store.worktree(sessionId, conversation.id);
            if (
              assigned &&
              (await linkedWorktreePath(project.path, assigned)) !== assigned
            )
              throw new HarnessError(
                409,
                "The assigned Git worktree is unavailable.",
              );
            directory = assigned ?? project.path;
          }
          await this.probeSandbox(directory, standalone);
        }
        const agent = await conversation.agent(context);
        const catalog = agent.extensions.flatMap(
          (extension) => extension.tools ?? [],
        );
        const stored = await harness.snapshot(
          AgentDoc,
          conversation.id,
          context,
        );
        await conversation.commit(async (tx) => {
          if (change.remoteProfile !== undefined)
            (await tx.doc(RemoteWorkspaceDoc, conversation.id)).profile =
              change.remoteProfile;
          if (
            change.codeMode !== undefined &&
            change.codeMode !== current.codeMode
          )
            selectAdvancedTools(
              await tx.doc(AgentDoc, conversation.id),
              change.codeMode,
              current.mcpEnabled,
            );
          if (change.mcp !== undefined && change.mcp !== current.mcpEnabled) {
            const agent = await tx.doc(AgentDoc, conversation.id);
            const tools =
              this.runtime.mcp.extension().tools?.map((tool) => tool.name) ??
              [];
            const names =
              !change.mcp && current.codeMode
                ? tools.filter((name) => name !== "tool_search")
                : tools;
            selectExtensionTools(agent, mcpExtensionName, names, change.mcp, [
              "tool_search",
            ]);
          }
          if (change.sandbox !== undefined)
            (await tx.doc(SandboxDoc, conversation.id)).enabled =
              change.sandbox;
          if (change.postRunCommand !== undefined) {
            const check = await tx.doc(PostRunDoc, conversation.id);
            const command = change.postRunCommand?.trim();
            if (command) check.command = command;
            else delete check.command;
          }
          if (
            change.planMode !== undefined &&
            change.planMode !== current.plan.active
          ) {
            const plan = await tx.doc(PlanDoc, conversation.id);
            if (change.planMode) {
              plan.previous = structuredClone({
                ...(stored?.extensions !== undefined && {
                  extensions: stored.extensions,
                }),
                ...(stored?.tools !== undefined && { tools: stored.tools }),
                ...(stored?.modelTools !== undefined && {
                  modelTools: stored.modelTools,
                }),
              });
              await configure(tx, conversation.id, {
                extensions: [
                  ...agent.extensions.filter(
                    (extension) => extension.name === "console.workspace",
                  ),
                  PlanExtension,
                ],
                tools: PlanExtension.tools,
                modelTools: null,
              });
            } else {
              const agent = await tx.doc(AgentDoc, conversation.id);
              const previous = copyJson(plan.previous ?? {});
              delete agent.extensions;
              delete agent.tools;
              delete agent.modelTools;
              Object.assign(agent, previous);
              delete plan.previous;
            }
          }
          await configure(tx, conversation.id, {
            maxTurns: change.maxTurns,
            tools:
              selected == null
                ? selected
                : catalog.filter((tool) => selected.includes(tool.name)),
            instructions:
              change.instructions === undefined
                ? undefined
                : change.instructions?.trim() || null,
          });
        }, context);
        if (change.sandbox !== undefined || change.planMode !== undefined)
          this.runtime.releaseSandbox(sessionId, conversation.id);
      }
      return this.readConfiguration(record, harness, conversation);
    });
  }

  private availableModel(model: ModelRef) {
    return this.providers.store.enabled(model.provider)
      ? this.providers.models.getModel(model.provider, model.modelId)
      : undefined;
  }

  private async probeSandbox(directory: string, standalone: boolean) {
    try {
      await this.runtime.probeSandbox(directory, standalone);
    } catch {
      throw new HarnessError(
        409,
        "Could not start the workspace sandbox. It requires a permitted workspace and Linux Bubblewrap with unprivileged namespaces.",
      );
    }
  }

  compactConversation(sessionId: string, id: string, focus?: string) {
    return this.serial(sessionId, async () => {
      const { harness, conversation } = await this.conversation(sessionId, id);
      await this.assertIdle(harness, conversation.id);
      if (await exceedsBudget(harness, this.store.tokenBudget(sessionId)))
        throw new HarnessError(409, budgetReached);
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
      this.runtime.releaseSandbox(sessionId, conversation.id);
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
        await this.runtime.purge(sessionId, Number(id), (owned) =>
          this.archives.deleting(sessionId, Number(id), owned),
        );
        this.store.setWorktree(sessionId, Number(id), null);
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
    if (await exceedsBudget(harness, this.store.tokenBudget(sessionId)))
      throw new HarnessError(409, budgetReached);
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
    const submissionId = await conversation.commit(async (tx) => {
      if (changedModel || changedThinking) {
        const live = await tx.doc(LiveDoc, conversation.id);
        const inbox = await tx.doc(InboxDoc, conversation.id);
        if (live.run || inbox.items.length)
          throw new HarnessError(
            409,
            "Wait until this conversation is idle before changing its model or thinking level.",
          );
        await configure(tx, conversation.id, {
          model,
          thinkingLevel:
            (thinkingLevel as ModelThinkingLevel | undefined) ??
            (changedModel ? null : undefined),
        });
      }
      const submissionId = await conversation.submit(tx, {
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
      });
      (await tx.doc(ConversationInfo, conversation.id)).lastSubmissionId =
        submissionId;
      return submissionId;
    }, context);
    const submission = await harness.submission(submissionId, context);
    if (!submission) throw new Error("Committed submission could not be read.");
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

  continueConversation(sessionId: string, id: string, failedTaskId: number) {
    return this.serial(sessionId, async () => {
      const { harness, conversation } = await this.conversation(sessionId, id);
      const requestId = `console.continue:${failedTaskId}`;
      const agent = await conversation.agent(context);
      const modelAvailable =
        !!agent.model && !!this.availableModel(agent.model);
      const exhausted = await exceedsBudget(
        harness,
        this.store.tokenBudget(sessionId),
      );
      const submissionId = await conversation.commit(async (tx) => {
        const existing = await tx.submissionByRequest(
          conversation.id,
          requestId,
        );
        if (existing) return existing.id;
        if (exhausted) throw new HarnessError(409, budgetReached);
        const live = await tx.doc(LiveDoc, conversation.id);
        if (
          live.run ||
          live.runFailure?.taskId !== failedTaskId ||
          !canContinue(live.runFailure.reason)
        )
          throw new HarnessError(
            409,
            "This run is no longer available to continue.",
          );
        if (!modelAvailable)
          throw new HarnessError(409, "The conversation model is unavailable.");
        const submissionId = await conversation.submit(tx, {
          type: "continue",
          requestId,
        });
        (await tx.doc(ConversationInfo, conversation.id)).lastSubmissionId =
          submissionId;
        return submissionId;
      }, context);
      return { id: submissionId };
    });
  }
  async attachment(
    sessionId: string,
    id: string,
    entryId: string,
    index: number,
  ) {
    const { conversation } = await this.conversation(sessionId, id);
    const at = Number(entryId) as EntryId;
    const {
      items: [entry],
    } = await conversation.entries(
      { minEntryId: at, maxEntryId: at },
      1,
      undefined,
      context,
    );
    if (!entry)
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
      await this.abortConversations(harness, context, true);
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
