import { randomUUID } from "node:crypto";
import { copyJson } from "@earendil-works/chord";
import {
  BACKGROUND_CONTEXT as context,
  withAbortSignal,
} from "@earendil-works/chord/context";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type {
  AgentState,
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
import type { AgentProfile } from "./agent-profiles.ts";
import {
  AttachmentError,
  type AttachmentInput,
  prepareAttachments,
  readAttachment,
} from "./attachments.ts";
import {
  BackgroundJob,
  type BackgroundJobInput,
  captureJobAgent,
} from "./background-job.ts";
import {
  BackgroundReview,
  type BackgroundReviewInput,
  type ReviewDelivery,
  ReviewRequests,
} from "./background-review.ts";
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
import { assertJobEnvironment } from "./job-workspace.ts";
import { mcpExtensionName } from "./mcp-tools.ts";
import {
  AgentRequests,
  admitAgentMessage,
  createPersistentAgent,
  PersistentAgents,
} from "./persistent-agents.ts";
import { PlanDoc, PlanExtension } from "./plan.ts";
import { CheckRequestEntry, CheckTask, PostRunDoc } from "./post-run.ts";
import { queueView } from "./queue.ts";
import { type JobRecurrence, RecurringJob } from "./recurring-job.ts";
import { RecurringReview, type ReviewRecurrence } from "./recurring-review.ts";
import { ReviewExtension, ReviewerAgent } from "./reviewer.ts";
import type { ReviewerProfile } from "./reviewer-profiles.ts";
import { HarnessRuntime } from "./runtime.ts";
import {
  type HarnessRecord,
  type HarnessStore,
  standaloneOwner,
} from "./store.ts";
import { taskDiagnostic } from "./task-diagnostics.ts";
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
        reviewerProfiles: () => store.reviewerProfiles().profiles,
        reviewerProfile: (id) => this.reviewerProfileSelection(id),
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
        runtimePolicy: (sessionId) => store.runtimePolicy(sessionId),
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
        const { conversations } = await this.conversations(record.sessionId);
        return conversations.map((conversation) => ({
          ...record,
          name: conversation.name,
          conversationId: conversation.id,
          parent: conversation.parent,
        }));
      }),
    );
    return { sessions: records.flat() };
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
  async standalone(sessionId: string, includeArchived = false, id?: string) {
    if (this.maintaining.has(sessionId))
      throw new HarnessError(503, "Session maintenance is in progress.");
    const record = this.store.session(sessionId);
    if (record?.projectId !== standaloneOwner)
      throw new HarnessError(404, "Standalone conversation not found.");
    const harness = await this.ready(record);
    const root = await harness.root(context);
    const conversationId =
      id === undefined ? root.id : (Number(id) as ConversationId);
    const selected = await harness.commit(
      (tx) => tx.conversation(conversationId),
      context,
    );
    if (!selected || selected.owner)
      throw new HarnessError(404, "Standalone conversation not found.");
    if (!includeArchived && this.archives.get(sessionId, conversationId))
      throw new HarnessError(404, "Conversation is archived or deleted.");
    const info = await harness.snapshot(
      ConversationInfo,
      conversationId,
      context,
    );
    return {
      session: { ...record, name: info?.name ?? record.name },
      conversationId,
      parent: selected.parent,
      conversations: (await this.conversations(sessionId)).conversations,
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

  async reviewerProfiles() {
    const { models } = await this.providers.favorites();
    return { ...this.store.reviewerProfiles(), models };
  }

  async updateReviewerProfiles(revision: number, profiles: ReviewerProfile[]) {
    const ids = new Set<string>();
    const names = new Set<string>();
    const normalized = profiles.map((profile) => ({
      ...profile,
      name: profile.name.trim(),
      instructions: profile.instructions.trim(),
    }));
    for (const profile of normalized) {
      const name = profile.name.toLowerCase();
      if (!name || ids.has(profile.id) || names.has(name))
        throw new HarnessError(
          400,
          "Reviewer profiles need unique identities and non-empty unique names.",
        );
      ids.add(profile.id);
      names.add(name);
      const selected = await this.model(profile.model);
      if (
        profile.thinkingLevel !== null &&
        !selected.thinkingLevels.includes(
          profile.thinkingLevel as ModelThinkingLevel,
        )
      )
        throw new HarnessError(
          400,
          "This thinking level is unavailable for the selected review model.",
        );
    }
    if (!this.store.setReviewerProfiles(revision, normalized))
      throw new HarnessError(
        409,
        "Reviewer profiles changed. Reload and try again.",
      );
    return this.store.reviewerProfiles();
  }

  private async reviewerProfileSelection(id: string) {
    const profile = this.store
      .reviewerProfiles()
      .profiles.find((item) => item.id === id);
    if (!profile) throw new HarnessError(404, "Reviewer profile not found.");
    const model = await this.model(profile.model);
    if (
      profile.thinkingLevel !== null &&
      !model.thinkingLevels.includes(
        profile.thinkingLevel as ModelThinkingLevel,
      )
    )
      throw new HarnessError(
        409,
        "The profile thinking level is no longer available.",
      );
    return profile;
  }

  async agentProfiles() {
    const { models } = await this.providers.favorites();
    return { ...this.store.agentProfiles(), models };
  }

  async updateAgentProfiles(revision: number, profiles: AgentProfile[]) {
    const ids = new Set<string>();
    const names = new Set<string>();
    const normalized = profiles.map((profile) => ({
      ...profile,
      name: profile.name.trim(),
      instructions: profile.instructions.trim(),
    }));
    for (const profile of normalized) {
      const name = profile.name.toLowerCase();
      if (!name || ids.has(profile.id) || names.has(name))
        throw new HarnessError(
          400,
          "Agent profiles need unique identities and non-empty unique names.",
        );
      ids.add(profile.id);
      names.add(name);
      const selected = await this.model(profile.model);
      if (
        profile.thinkingLevel !== null &&
        !selected.thinkingLevels.includes(
          profile.thinkingLevel as ModelThinkingLevel,
        )
      )
        throw new HarnessError(
          400,
          "This thinking level is unavailable for the selected agent model.",
        );
    }
    if (!this.store.setAgentProfiles(revision, normalized))
      throw new HarnessError(
        409,
        "Agent profiles changed. Reload and try again.",
      );
    return this.store.agentProfiles();
  }

  private async agentProfileSelection(
    profileId: string,
    base: AgentState,
  ): Promise<AgentState> {
    const profile = this.store
      .agentProfiles()
      .profiles.find((item) => item.id === profileId);
    if (!profile) throw new HarnessError(404, "Agent profile not found.");
    const model = await this.model(profile.model);
    if (
      profile.thinkingLevel !== null &&
      !model.thinkingLevels.includes(
        profile.thinkingLevel as ModelThinkingLevel,
      )
    )
      throw new HarnessError(
        409,
        "The profile thinking level is no longer available.",
      );
    const enabledTools = new Set(Array.isArray(base.tools) ? base.tools : []);
    if (profile.tools.some((tool) => !enabledTools.has(tool)))
      throw new HarnessError(
        409,
        "Profile tools must be enabled in the parent conversation before use.",
      );
    return {
      ...base,
      model: { ...profile.model },
      thinkingLevel: (profile.thinkingLevel ?? "off") as ModelThinkingLevel,
      instructions: profile.instructions,
      maxTurns: profile.maxTurns,
      tools: [...profile.tools],
      modelTools: Array.isArray(base.modelTools)
        ? base.modelTools.filter((tool) => profile.tools.includes(tool))
        : [...profile.tools],
    };
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

      const entryId = at as EntryId;
      const key = `fork:${conversation.id}:${entryId}:${creationId}`;
      if (record.projectId !== standaloneOwner)
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

  async persistentAgent(sessionId: string, id: string, agentId: string) {
    const scope = await this.conversation(sessionId, id);
    const state = await scope.harness.snapshot(
      PersistentAgents,
      scope.conversation.id,
      context,
    );
    const agent = state?.agents.find((item) => item.id === agentId);
    const row =
      agent &&
      (await scope.harness.commit(
        (tx) => tx.conversation(agent.conversationId),
        context,
      ));
    if (
      !agent ||
      row?.owner?.conversationId !== scope.conversation.id ||
      row.owner.taskId !== agent.anchorId
    )
      throw new HarnessError(404, "Agent not found in this conversation.");
    const child = await scope.harness.conversation(
      agent.conversationId,
      context,
    );
    if (!child) throw new HarnessError(404, "Agent conversation not found.");
    return { ...scope, agent, child };
  }

  async listAgents(sessionId: string, id: string) {
    const { harness, conversation } = await this.conversation(sessionId, id);
    const state = await harness.snapshot(
      PersistentAgents,
      conversation.id,
      context,
    );
    const agents = await Promise.all(
      (state?.agents ?? []).map(async (agent) => {
        const live = await harness.snapshot(
          LiveDoc,
          agent.conversationId,
          context,
        );
        const inbox = await harness.snapshot(
          InboxDoc,
          agent.conversationId,
          context,
        );
        return {
          ...agent,
          busy: !!live?.run,
          queue: queueView(inbox?.items ?? []),
        };
      }),
    );
    return { agents };
  }

  createAgent(
    sessionId: string,
    id: string,
    agentId: string,
    name: string,
    profileId?: string,
  ) {
    return this.serial(sessionId, async () => {
      const { record, harness, conversation } = await this.conversation(
        sessionId,
        id,
      );
      if (record.projectId !== standaloneOwner)
        this.projects.assertWritable(record.projectId);
      const state = await harness.snapshot(
        PersistentAgents,
        conversation.id,
        context,
      );
      const existing = state?.agents.find((agent) => agent.id === agentId);
      if (existing) return existing;
      if (!name.trim() || name.trim().length > 100)
        throw new HarnessError(
          400,
          "Provide an agent name of at most 100 characters.",
        );
      if (
        state?.agents.some(
          (agent) => agent.name.toLowerCase() === name.trim().toLowerCase(),
        )
      )
        throw new HarnessError(409, "An agent already uses this name.");
      if ((state?.agents.length ?? 0) >= 32)
        throw new HarnessError(409, "This conversation already has 32 agents.");
      const parentAgent = await conversation.agent(context);
      const selected = profileId
        ? await this.agentProfileSelection(
            profileId,
            captureJobAgent(parentAgent),
          )
        : undefined;
      const model = selected?.model ?? parentAgent.model;
      if (!model || !this.availableModel(model))
        throw new HarnessError(
          409,
          "Choose an available conversation model first.",
        );
      const result = await conversation.commit(async (tx) => {
        const result = await createPersistentAgent(
          tx,
          conversation.id,
          agentId,
          name,
        );
        if (selected)
          Object.assign(
            await tx.doc(AgentDoc, result.conversationId),
            selected,
          );
        return result;
      }, context);
      harness.resume();
      return result;
    });
  }

  messageAgent(
    sessionId: string,
    id: string,
    agentId: string,
    content: string,
    requestId: string,
    whenBusy: "steer" | "followUp" = "followUp",
    delivery: ReviewDelivery = "context",
  ) {
    return this.serial(sessionId, async () => {
      const { record, harness, conversation, agent, child } =
        await this.persistentAgent(sessionId, id, agentId);
      const previous = await harness.snapshot(
        AgentRequests,
        conversation.id,
        `${agent.id}:${requestId}`,
        context,
      );
      if (previous?.taskId !== undefined) return { id: previous.taskId };
      if (record.projectId !== standaloneOwner)
        this.projects.assertWritable(record.projectId);
      if (!content.trim() || content.length > 32000)
        throw new HarnessError(
          400,
          "Provide an agent message of at most 32000 characters.",
        );
      const selected = await child.agent(context);
      if (!selected.model || !this.availableModel(selected.model))
        throw new HarnessError(409, "The agent model is unavailable.");
      if (await exceedsBudget(harness, this.store.tokenBudget(sessionId)))
        throw new HarnessError(409, budgetReached);
      const taskId = await conversation.commit(
        (tx) =>
          admitAgentMessage(
            tx,
            conversation.id,
            agent,
            child,
            content,
            requestId,
            whenBusy,
            delivery,
          ),
        context,
      );
      harness.resume();
      return { id: taskId };
    });
  }

  stopAgent(sessionId: string, id: string, agentId: string) {
    return this.serial(sessionId, async () => {
      const { child } = await this.persistentAgent(sessionId, id, agentId);
      await child.abort(context, { background: true });
      return { stopped: true };
    });
  }

  async jobConversation(sessionId: string, id: string, taskId: string) {
    const { harness, conversation } = await this.conversation(sessionId, id);
    const childId = await harness.commit(async (tx) => {
      const task = await tx.task(Number(taskId) as TaskId);
      if (
        task?.conversationId !== conversation.id ||
        task.kind !== BackgroundJob.definition.name
      )
        throw new HarnessError(404, "Job not found in this conversation.");
      const child = (await tx.scanConversations({ ownerTaskId: task.id }, 1))
        .items[0];
      if (!child || child.owner?.conversationId !== conversation.id)
        throw new HarnessError(404, "The job has no worker conversation yet.");
      return child.id;
    }, context);
    const child = await harness.conversation(childId, context);
    if (!child) throw new HarnessError(404, "Job conversation not found.");
    return child;
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

  async activeTasks(sessionId: string, id: string) {
    const { harness, conversation } = await this.conversation(sessionId, id);
    const watch = await harness.watchTaskGraph(context);
    try {
      const graph = watch.value;
      const owned = await harness.commit(async (tx) => {
        const scope = new Set<ConversationId>([conversation.id]);
        const excluded = new Set<ConversationId>();
        for (const task of Object.values(graph.tasks)) {
          const chain = new Set<ConversationId>();
          let next: ConversationId | undefined = task.conversationId;
          while (
            next !== undefined &&
            !scope.has(next) &&
            !excluded.has(next) &&
            !chain.has(next)
          ) {
            chain.add(next);
            next = (await tx.conversation(next))?.owner?.conversationId;
          }
          const destination =
            next !== undefined && scope.has(next) ? scope : excluded;
          for (const child of chain) destination.add(child);
        }
        return [...scope];
      }, context);
      return { graph, root: conversation.id, owned };
    } finally {
      await watch.stop();
    }
  }

  async taskHistory(
    sessionId: string,
    id: string,
    cursor?: Cursor,
    reviewId?: string,
  ) {
    const scope = await this.conversation(sessionId, id);
    const conversation =
      reviewId === undefined
        ? scope.conversation
        : await this.review(sessionId, id, reviewId);
    return scope.harness.commit(async (tx) => {
      const page = await tx.scanTasks(
        {
          conversationId: conversation.id,
          status: "terminal",
          order: "descending",
        },
        50,
        cursor,
      );
      const tasks = await Promise.all(
        page.items.map(async (task) => {
          const children = await tx.scanConversations(
            { ownerTaskId: task.id },
            1,
          );
          const childAgent = children.items[0]
            ? await tx.doc(AgentDoc, children.items[0].id)
            : undefined;
          const isReviewer =
            Array.isArray(childAgent?.extensions) &&
            childAgent.extensions.includes(ReviewerAgent.name);
          const outcome =
            task.state.status === "terminal" ? task.state.outcome : undefined;
          return {
            id: task.id,
            kind: task.kind,
            owner: task.owner,
            background: task.background,
            status: outcome?.status,
            diagnostic: taskDiagnostic(outcome),
            startedAt: task.startedAt,
            endedAt: task.endedAt,
            restarts: task.restarts ?? 0,
            ...(task.kind === BackgroundReview.definition.name &&
              task.version === BackgroundReview.definition.version && {
                retryable:
                  outcome?.status !== "completed" || outcome.result !== true,
                retryOf: (task.input as BackgroundReviewInput).retryOf,
                profile: (task.input as BackgroundReviewInput).profile,
              }),
            ...(task.kind === BackgroundReview.definition.name &&
              outcome?.status === "completed" && {
                reviewSucceeded: outcome.result === true,
              }),
            ...(children.items[0] &&
              isReviewer && { reviewId: children.items[0].id }),
            ...(task.kind === CheckTask.definition.name &&
              task.version === CheckTask.definition.version && {
                checkResult:
                  outcome?.status === "completed" &&
                  (outcome.result === "passed" ||
                    outcome.result === "failed" ||
                    outcome.result === "cancelled" ||
                    outcome.result === "interrupted")
                    ? outcome.result
                    : undefined,
                recheckable:
                  outcome?.status !== "completed" ||
                  outcome.result !== "passed",
                retryOf: (task.input as { retryOf?: number }).retryOf,
              }),
            ...(task.kind === BackgroundJob.definition.name &&
              task.version === BackgroundJob.definition.version && {
                retryable:
                  outcome?.status !== "completed" || outcome.result !== true,
                retryOf: (task.input as BackgroundJobInput).retryOf,
              }),
            ...(task.kind === BackgroundJob.definition.name &&
              children.items[0] && { jobTaskId: task.id }),
            ...(task.kind === BackgroundJob.definition.name &&
              outcome?.status === "completed" && {
                jobSucceeded: outcome.result === true,
              }),
          };
        }),
      );
      return { tasks, cursor: page.next };
    }, context);
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

  scheduleJob(
    sessionId: string,
    id: string,
    content: string,
    requestId: string,
    at = Date.now(),
    delivery: ReviewDelivery = "context",
    recurrence?: JobRecurrence,
    profileId?: string,
    retry?: BackgroundJobInput & { retryOf: number },
  ) {
    return this.serial(sessionId, async () => {
      const { record, harness, conversation } = await this.conversation(
        sessionId,
        id,
      );
      if (record.projectId !== standaloneOwner)
        this.projects.assertWritable(record.projectId);
      let agent = captureJobAgent(await conversation.agent(context));
      const taskId = await conversation.commit(async (tx) => {
        const request = await tx.doc(
          ReviewRequests,
          conversation.id,
          `console.job:${requestId}`,
          null,
        );
        if (request.taskId !== undefined) return request.taskId;
        if (profileId)
          agent = await this.agentProfileSelection(profileId, agent);
        if (retry) {
          const enabled = new Set(
            Array.isArray(agent.tools) ? agent.tools : [],
          );
          if (
            !Array.isArray(retry.agent.tools) ||
            retry.agent.tools.some((tool) => !enabled.has(tool))
          )
            throw new HarnessError(
              409,
              "The original job tools are no longer enabled. Restore them or schedule a new job explicitly.",
            );
          agent = structuredClone(retry.agent);
          if (!agent.model)
            throw new HarnessError(
              409,
              "The original job model is unavailable.",
            );
          const model = await this.model(agent.model);
          if (
            agent.thinkingLevel &&
            agent.thinkingLevel !== "off" &&
            !model.thinkingLevels.includes(agent.thinkingLevel)
          )
            throw new HarnessError(
              409,
              "The original thinking level is no longer available.",
            );
        }
        if (!content.trim() || content.length > 32000)
          throw new HarnessError(
            400,
            "Provide job instructions of at most 32000 characters.",
          );
        if (!Number.isSafeInteger(at) || at < 0 || at > 8640000000000000)
          throw new HarnessError(400, "Provide a valid job start time.");
        if (!["display", "context", "followUp"].includes(delivery))
          throw new HarnessError(400, "Choose a supported result delivery.");
        if (!agent.model || !this.availableModel(agent.model))
          throw new HarnessError(
            409,
            "Choose an available conversation model first.",
          );
        if (
          recurrence &&
          (!Number.isInteger(recurrence.intervalMs) ||
            recurrence.intervalMs < 60000 ||
            recurrence.intervalMs > 31536000000 ||
            !Number.isInteger(recurrence.occurrences) ||
            recurrence.occurrences < 2 ||
            recurrence.occurrences > 1000)
        )
          throw new HarnessError(
            400,
            "Choose 2–1000 occurrences and an interval between one minute and one year.",
          );
        const remoteProfile = (
          await tx.doc(RemoteWorkspaceDoc, conversation.id)
        ).profile;
        if (remoteProfile && !this.runtime.remote.identity(remoteProfile))
          throw new HarnessError(
            409,
            "The selected SSH profile is unavailable. Choose a valid workspace before scheduling.",
          );
        const environment = {
          directory:
            record.projectId === standaloneOwner
              ? await this.runtime.standaloneWorkspace(sessionId)
              : (await this.project(record.projectId)).path,
          worktree:
            record.projectId === standaloneOwner
              ? null
              : this.store.worktree(sessionId, conversation.id),
          sandbox: (await tx.doc(SandboxDoc, conversation.id)).enabled,
          remoteProfile,
          remoteIdentity: remoteProfile
            ? this.runtime.remote.identity(remoteProfile)
            : null,
        };
        if (retry?.environment) {
          try {
            assertJobEnvironment(retry.environment, environment);
          } catch {
            throw new HarnessError(
              409,
              "The job workspace policy changed. Restore it or schedule a new job explicitly.",
            );
          }
        }
        const input = {
          ...(retry && { retryOf: retry.retryOf }),
          environment,
          content: content.trim(),
          at,
          agent,
          delivery,
          postRun: retry
            ? { ...retry.postRun }
            : { ...(await tx.doc(PostRunDoc, conversation.id)) },
        };
        const options = {
          ownership: { kind: "conversation" as const },
          background: true,
        };
        const job = recurrence
          ? await tx.createTask(
              RecurringJob,
              { job: input, recurrence },
              options,
            )
          : await tx.createTask(BackgroundJob, input, options);
        request.taskId = job;
        return job;
      }, context);
      harness.resume();
      return { id: taskId };
    });
  }

  recheck(sessionId: string, id: string, taskId: string, requestId: string) {
    return this.serial(sessionId, async () => {
      const { record, harness, conversation } = await this.conversation(
        sessionId,
        id,
      );
      const admissionId = `console.recheck:${taskId}:${requestId}`;
      const existing = await harness.commit(
        (tx) => tx.submissionByRequest(conversation.id, admissionId),
        context,
      );
      if (existing) return { id: existing.id };
      if (record.projectId !== standaloneOwner)
        await this.project(record.projectId);
      await this.assertIdle(harness, conversation.id);
      const agent = await conversation.agent(context);
      if (!agent.model || !this.availableModel(agent.model))
        throw new HarnessError(
          409,
          "Choose an available model before requesting a recheck.",
        );
      if (
        !agent.extensions.some(
          (extension) => extension.name === "console.post-run",
        )
      )
        throw new HarnessError(
          409,
          "Post-run checks are not enabled in this conversation.",
        );
      if (await exceedsBudget(harness, this.store.tokenBudget(sessionId)))
        throw new HarnessError(409, budgetReached);
      const submissionId = await conversation.commit(async (tx) => {
        const task = await tx.task(Number(taskId) as TaskId);
        if (
          task?.conversationId !== conversation.id ||
          task.kind !== CheckTask.definition.name
        )
          throw new HarnessError(
            404,
            "Post-run check not found in this conversation.",
          );
        if (
          task.version !== CheckTask.definition.version ||
          task.state.status !== "terminal" ||
          (task.state.outcome.status === "completed" &&
            task.state.outcome.result === "passed")
        )
          throw new HarnessError(
            409,
            "Only failed, interrupted or cancelled checks can be rechecked.",
          );
        if (!(await tx.doc(PostRunDoc, conversation.id)).command)
          throw new HarnessError(
            409,
            "Configure a check command before requesting a recheck.",
          );
        const submission = await conversation.submit(tx, {
          type: "input",
          requestId: admissionId,
          whenBusy: "reject",
          content:
            "Review the previous post-run check result and briefly assess whether any correction is needed. The currently configured check will run automatically after your final answer. Do not run that check command yourself. Earlier tool or file effects may remain; preserve the user's intended changes.",
          entry: {
            kind: CheckRequestEntry.kind,
            data: { sourceTaskId: task.id },
          },
        });
        (await tx.doc(ConversationInfo, conversation.id)).lastSubmissionId =
          submission;
        return submission;
      }, context);
      harness.resume();
      return { id: submissionId };
    });
  }

  async retryJob(
    sessionId: string,
    id: string,
    taskId: string,
    requestId: string,
  ) {
    const { harness, conversation } = await this.conversation(sessionId, id);
    const task = await harness.commit(
      (tx) => tx.task(Number(taskId) as TaskId),
      context,
    );
    if (
      task?.conversationId !== conversation.id ||
      task.kind !== BackgroundJob.definition.name
    )
      throw new HarnessError(
        404,
        "Background job not found in this conversation.",
      );
    if (
      task.version !== BackgroundJob.definition.version ||
      task.state.status !== "terminal" ||
      (task.state.outcome.status === "completed" &&
        task.state.outcome.result === true)
    )
      throw new HarnessError(
        409,
        "Only failed or cancelled jobs with a supported task version can be retried.",
      );
    const input = task.input as BackgroundJobInput;
    return this.scheduleJob(
      sessionId,
      id,
      input.content,
      `retry:${task.id}:${requestId}`,
      undefined,
      input.delivery,
      undefined,
      undefined,
      { ...input, retryOf: task.id },
    );
  }

  stopJob(sessionId: string, id: string, taskId: string) {
    return this.serial(sessionId, async () => {
      const { harness, conversation } = await this.conversation(sessionId, id);
      const task = await harness.commit(
        (tx) => tx.task(Number(taskId) as TaskId),
        context,
      );
      if (
        task?.conversationId !== conversation.id ||
        ![BackgroundJob.definition.name, RecurringJob.definition.name].includes(
          task.kind,
        )
      )
        throw new HarnessError(
          404,
          "Background job not found in this conversation.",
        );
      await harness.abortTask(task.id, context);
      return { stopped: true };
    });
  }

  scheduleReview(
    sessionId: string,
    id: string,
    brief: string,
    requestId: string,
    at?: number,
    delivery: ReviewDelivery = "context",
    selection?: {
      model?: ModelRef;
      thinkingLevel?: string | null;
      maxTurns?: number;
      passes?: number;
      worktree?: string;
      retryOf?: number;
      recurrence?: ReviewRecurrence;
      profileId?: string;
      instructions?: string;
      profile?: { id: string; name: string };
    },
  ) {
    return this.serial(sessionId, async () => {
      const { record, harness, conversation } = await this.conversation(
        sessionId,
        id,
      );
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
        const profile =
          selection?.profileId === undefined
            ? undefined
            : this.store
                .reviewerProfiles()
                .profiles.find((item) => item.id === selection.profileId);
        if (selection?.profileId !== undefined && !profile)
          throw new HarnessError(404, "Reviewer profile not found.");
        if (
          profile &&
          (selection?.model !== undefined ||
            selection?.thinkingLevel !== undefined ||
            selection?.maxTurns !== undefined ||
            selection?.passes !== undefined)
        )
          throw new HarnessError(
            400,
            "Choose a profile or explicit reviewer settings, not both.",
          );
        const model = profile?.model ?? selection?.model ?? agent.model;
        if (!model || !this.availableModel(model))
          throw new HarnessError(
            409,
            "Choose an available conversation model before scheduling a review.",
          );
        const metadata = await this.model(model);
        const thinkingLevel = profile
          ? profile.thinkingLevel
          : selection?.thinkingLevel !== undefined
            ? selection.thinkingLevel
            : selection?.model
              ? null
              : (agent.thinkingLevel ?? null);
        if (
          thinkingLevel !== null &&
          !metadata.thinkingLevels.includes(thinkingLevel as ModelThinkingLevel)
        )
          throw new HarnessError(
            400,
            "This thinking level is unavailable for the selected review model.",
          );
        let worktree: string | undefined;
        let worktreeProject: string | undefined;
        if (selection?.worktree !== undefined) {
          if (record.projectId === standaloneOwner)
            throw new HarnessError(
              400,
              "Dedicated review worktrees require a project conversation.",
            );
          if ((await tx.doc(RemoteWorkspaceDoc, conversation.id)).profile)
            throw new HarnessError(
              409,
              "Dedicated local reviews are unavailable while the parent uses SSH.",
            );
          const project = await this.project(record.projectId);
          worktreeProject = project.path;
          worktree = await linkedWorktreePath(project.path, selection.worktree);
          if (!worktree)
            throw new HarnessError(
              400,
              "Choose an existing linked worktree of this project.",
            );
        }
        const passes = profile?.passes ?? selection?.passes ?? 1;
        if (!Number.isInteger(passes) || passes < 1 || passes > 5)
          throw new HarnessError(
            400,
            "Review passes must be an integer from 1 to 5.",
          );
        const maxTurns = profile?.maxTurns ?? selection?.maxTurns ?? 6;
        if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 50)
          throw new HarnessError(
            400,
            "Review turn limit must be an integer from 1 to 50.",
          );
        const input: BackgroundReviewInput = {
          brief: trimmed,
          delivery,
          at: at ?? Date.now(),
          model,
          thinkingLevel: thinkingLevel as ModelThinkingLevel | null,
          maxTurns,
          passes,
          ...(worktree && { worktree, worktreeProject }),
          instructions: profile?.instructions ?? selection?.instructions ?? "",
          ...(profile
            ? { profile: { id: profile.id, name: profile.name } }
            : selection?.profile
              ? { profile: selection.profile }
              : {}),
          ...(selection?.retryOf !== undefined && {
            retryOf: selection.retryOf,
          }),
        };
        const recurrence = selection?.recurrence;
        if (
          recurrence &&
          (!Number.isInteger(recurrence.intervalMs) ||
            recurrence.intervalMs < 60000 ||
            recurrence.intervalMs > 31536000000 ||
            !Number.isInteger(recurrence.occurrences) ||
            recurrence.occurrences < 2 ||
            recurrence.occurrences > 1000)
        )
          throw new HarnessError(
            400,
            "Choose 2–1000 occurrences and an interval between one minute and one year.",
          );
        const options = {
          ownership: { kind: "conversation" as const },
          background: true,
        };
        const id = recurrence
          ? await tx.createTask(
              RecurringReview,
              { review: input, recurrence },
              options,
            )
          : await tx.createTask(BackgroundReview, input, options);
        request.taskId = id;
        return id;
      }, context);
      harness.resume();
      return { id: taskId };
    });
  }

  async retryReview(
    sessionId: string,
    id: string,
    taskId: string,
    requestId: string,
  ) {
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
    if (
      task.version !== BackgroundReview.definition.version ||
      task.state.status !== "terminal" ||
      (task.state.outcome.status === "completed" &&
        task.state.outcome.result === true)
    )
      throw new HarnessError(
        409,
        "Only failed or cancelled reviews with a supported task version can be retried.",
      );
    const input = task.input as BackgroundReviewInput;
    return this.scheduleReview(
      sessionId,
      id,
      input.brief,
      `console.review-retry:${task.id}:${requestId}`,
      undefined,
      input.delivery ?? "display",
      {
        model: input.model,
        thinkingLevel: input.thinkingLevel,
        maxTurns: input.maxTurns ?? 6,
        passes: input.passes ?? 1,
        worktree: input.worktree,
        retryOf: task.id,
        instructions: input.instructions,
        profile: input.profile,
      },
    );
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
        (task.kind !== BackgroundReview.definition.name &&
          task.kind !== RecurringReview.definition.name)
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
        runtimePolicy: this.store.runtimePolicy(record.sessionId),
        compaction: this.store.compaction(record.sessionId),
        tokenBudget: this.store.tokenBudget(record.sessionId),
        mcp: this.runtime.mcp.status(),
        managedExtensions: this.runtime.extensions.status(),
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
        change.managedExtensions !== undefined ||
        change.tools !== undefined ||
        change.instructions !== undefined ||
        change.maxTurns !== undefined ||
        change.planMode !== undefined ||
        change.postRunCommand !== undefined ||
        change.postRunRepairLimit !== undefined ||
        change.worktree !== undefined ||
        change.sandbox !== undefined ||
        change.remoteProfile !== undefined ||
        change.codeMode !== undefined ||
        change.mcp !== undefined;
      const compactionChange =
        change.keepRecentTokens !== undefined ||
        change.automaticCompaction !== undefined;
      const sessionChange =
        compactionChange ||
        change.runtimePolicy !== undefined ||
        change.tokenBudget !== undefined;
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
      if (
        conversationChange ||
        compactionChange ||
        change.runtimePolicy !== undefined
      )
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
      if (change.managedExtensions !== undefined) {
        if (
          Object.keys(change).some(
            (key) => key !== "revision" && key !== "managedExtensions",
          )
        )
          throw new HarnessError(400, "Change managed extensions separately.");
        if (current.plan.active)
          throw new HarnessError(
            409,
            "Exit Plan mode before changing extensions.",
          );
        if (
          change.managedExtensions.length &&
          (current.sandbox || current.remote?.profile)
        )
          throw new HarnessError(
            409,
            "Managed extensions run on the backend. Use local execution without a sandbox before selecting them.",
          );
        const available = new Set(
          this.runtime.extensions
            .status()
            .installed.map((extension) => extension.name),
        );
        if (
          change.managedExtensions.some(
            (name) =>
              !available.has(name) &&
              !current.managedExtensions.selected.includes(name),
          )
        )
          throw new HarnessError(
            409,
            "Install the extension on this backend before selecting it.",
          );
        await conversation.commit(async (tx) => {
          const agent = await tx.doc(AgentDoc, conversation.id);
          const selected = change.managedExtensions!;
          if (Array.isArray(agent.extensions)) {
            agent.extensions = [
              ...agent.extensions.filter((name) => !name.startsWith("user.")),
              ...selected,
            ];
          } else {
            agent.extensions = {
              add: [
                ...(agent.extensions?.add ?? []).filter(
                  (name) => !name.startsWith("user."),
                ),
                ...selected,
              ],
              remove: (agent.extensions?.remove ?? []).filter(
                (name) => !name.startsWith("user."),
              ),
            };
          }
        }, context);
        return this.readConfiguration(record, harness, conversation);
      }
      if (
        current.managedExtensions.selected.length &&
        (change.sandbox || change.remoteProfile)
      )
        throw new HarnessError(
          409,
          "Deselect managed extensions before enabling sandbox or remote execution.",
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
          change.postRunRepairLimit !== undefined ||
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
        if (change.runtimePolicy !== undefined)
          this.store.setRuntimePolicy(sessionId, change.runtimePolicy);
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
            change.postRunCommand !== undefined ||
            change.postRunRepairLimit !== undefined
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
          if (change.postRunRepairLimit !== undefined) {
            if (
              !Number.isInteger(change.postRunRepairLimit) ||
              change.postRunRepairLimit < 0 ||
              change.postRunRepairLimit > 5
            )
              throw new HarnessError(
                400,
                "Repair attempts must be between 0 and 5.",
              );
            (await tx.doc(PostRunDoc, conversation.id)).repairLimit =
              change.postRunRepairLimit;
          }
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
