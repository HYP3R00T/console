import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type {
  ConversationId,
  Cursor,
  ModelRef,
  SubmissionId,
} from "@earendil-works/pi-durable";
import { AgentDoc, InboxDoc, LiveDoc } from "@earendil-works/pi-durable";
import { ProjectError, type ProjectService } from "../projects/service.ts";
import type { ProviderService } from "../providers/service.ts";
import { ConversationInfo, SessionInfo } from "./documents.ts";
import { HarnessRuntime } from "./runtime.ts";
import type { HarnessRecord, HarnessStore } from "./store.ts";

export class HarnessError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
export class HarnessService {
  readonly runtime;
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
    this.projects = projects;
    this.providers = providers;
    this.runtime = new HarnessRuntime(directory, providers);
    projects.afterRegister = (id) =>
      this.operation(() => this.ensureDefault(id));
    projects.removalGuard = (id) => {
      if (store.list(id).length)
        throw new ProjectError(
          409,
          "This project owns sessions. Removal is unavailable until session cleanup is supported.",
        );
    };
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

  async ensureDefault(projectId: string) {
    const project = this.projects.store.get(projectId);
    if (!project) throw new HarnessError(404, "Project not found.");
    const record =
      this.store.list(projectId)[0] ?? this.store.insert(projectId);
    await this.initialize(
      record,
      project.path,
      record.modelId
        ? { provider: record.provider, modelId: record.modelId }
        : undefined,
    );
    return record;
  }
  async create(projectId: string, model?: ModelRef) {
    const project = await this.project(projectId);
    if (model) await this.model(model);
    await this.ensureDefault(projectId);
    if (!this.projects.store.get(projectId))
      throw new HarnessError(404, "Project not found.");
    const record = this.store.insert(
      projectId,
      model?.provider,
      model?.modelId,
    );
    await this.initialize(record, project.path, model);
    return record;
  }
  private async initialize(
    record: HarnessRecord,
    cwd: string,
    model: ModelRef | undefined,
  ) {
    const harness = await this.runtime.open(record.sessionId);
    return harness.root(context, {
      agent: { ...(model ? { model } : {}), cwd },
      init: async (tx, id) => {
        const info = await tx.doc(ConversationInfo, id);
        info.name = "Main";
      },
    });
  }
  private async ready(record: HarnessRecord) {
    const project = await this.projects.get(record.projectId);
    await this.initialize(
      record,
      project.path,
      record.modelId
        ? {
            provider: record.provider,
            modelId: record.modelId,
          }
        : undefined,
    );
    return this.runtime.open(record.sessionId);
  }
  async session(sessionId: string) {
    const record = this.store.session(sessionId);
    if (!record) throw new HarnessError(404, "Session not found.");
    await this.projects.get(record.projectId);
    return { record, harness: await this.ready(record) };
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
    return { session: record, conversations, more: !!records.next };
  }
  addConversation(sessionId: string) {
    return this.serial(sessionId, async () => {
      const { record, harness } = await this.session(sessionId);
      const project = await this.project(record.projectId);
      const root = await harness.root(context);
      const agent = await harness.snapshot(AgentDoc, root.id, context);
      let name = "Conversation";
      const conversation = await harness.createConversation(
        {
          ownership: { kind: "ownerless" },
          agent: {
            ...(agent?.model
              ? { model: agent.model, thinkingLevel: agent.thinkingLevel }
              : {}),
            cwd: project.path,
          },
          init: async (tx, id) => {
            const counter = await tx.doc(SessionInfo);
            const info = await tx.doc(ConversationInfo, id);
            name = `Conversation ${counter.nextConversation++}`;
            info.name = name;
          },
        },
        context,
      );
      return { id: conversation.id, name };
    });
  }
  async conversation(sessionId: string, id: string) {
    const { record, harness } = await this.session(sessionId);
    const conversation = await harness.conversation(
      Number(id) as ConversationId,
      context,
    );
    if (!conversation)
      throw new HarnessError(404, "Conversation not found in this session.");
    return { record, harness, conversation };
  }
  async admit(
    sessionId: string,
    id: string,
    content: string,
    requestId: string,
    selection?: { model?: ModelRef; thinkingLevel?: string },
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
      { type: "input", content, requestId },
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
    selection?: { model?: ModelRef; thinkingLevel?: string },
  ) {
    return this.serial(sessionId, () =>
      this.admit(sessionId, id, content, requestId, selection),
    );
  }
  stop(sessionId: string) {
    return this.serial(sessionId, async () => {
      const { harness } = await this.session(sessionId);
      let cursor: Cursor | undefined;
      do {
        const page = await harness.commit(
          (tx) => tx.scanConversations({}, 200, cursor),
          context,
        );
        await Promise.all(
          page.items.map(async (row) => {
            const conversation = await harness.conversation(row.id, context);
            await conversation?.abort(context);
          }),
        );
        cursor = page.next;
      } while (cursor);
      return { stopped: true };
    });
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

  async history(sessionId: string, id: string, cursor?: Cursor) {
    const { conversation } = await this.conversation(sessionId, id);
    return conversation.entries({}, 50, cursor, context);
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
