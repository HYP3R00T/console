import { randomUUID } from "node:crypto";
import type {
  WorkflowDefinition,
  WorkflowRunView,
  WorkflowVersion,
} from "@console/contracts";
import { copyJson } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { TaskId } from "@earendil-works/pi-durable";
import { CronExpressionParser } from "cron-parser";
import { ReviewRequests } from "../harnesses/background-review.ts";
import { HarnessError, type HarnessService } from "../harnesses/service.ts";
import { taskDiagnostic } from "../harnesses/task-diagnostics.ts";
import type { ProjectService } from "../projects/service.ts";
import { GitHubActions } from "./github.ts";
import {
  approvalRevision,
  type WorkflowInput,
  WorkflowRun,
  WorkflowRuns,
} from "./task.ts";

export function nextCron(expression: string, timezone: string, after: number) {
  if (expression.trim().split(/\s+/).length !== 5)
    throw new HarnessError(400, "Use a five-field cron expression.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return CronExpressionParser.parse(expression, {
      tz: timezone,
      currentDate: after,
    })
      .next()
      .getTime();
  } catch {
    throw new HarnessError(
      400,
      "Provide a valid cron expression and IANA timezone.",
    );
  }
}

export function validateDefinition(definition: WorkflowDefinition) {
  const ids = definition.steps.map((step) => step.id);
  if (new Set(ids).size !== ids.length)
    throw new HarnessError(400, "Step IDs must be unique.");
  definition.steps.forEach((step, index) => {
    const targets =
      step.type === "condition" ? [step.yes, step.no] : [step.next];
    if (
      targets.some((target) => target !== null && ids.indexOf(target) <= index)
    )
      throw new HarnessError(
        400,
        "Steps must point forward to an existing step or finish.",
      );
    if (
      step.type === "condition" &&
      (ids.indexOf(step.source) < 0 ||
        ids.indexOf(step.source) >= index ||
        definition.steps[ids.indexOf(step.source)]?.type !== "agent")
    )
      throw new HarnessError(
        400,
        "Conditions must read an earlier agent step.",
      );
  });
  if (definition.trigger?.type === "cron")
    nextCron(
      definition.trigger.expression,
      definition.trigger.timezone,
      Date.now(),
    );
}

export class WorkflowService {
  private harnesses: HarnessService;
  private projects: ProjectService;
  readonly github: GitHubActions;
  private timer?: ReturnType<typeof setInterval>;
  private ticking?: Promise<void>;
  lastTriggerError?: string;
  constructor(
    harnesses: HarnessService,
    projects: ProjectService,
    github = new GitHubActions(),
  ) {
    this.harnesses = harnesses;
    this.projects = projects;
    this.github = github;
    harnesses.store.db.exec(`CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY, projectId TEXT NOT NULL, version INTEGER NOT NULL,
      sessionId TEXT NOT NULL, conversationId TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, nextAt INTEGER);
      CREATE TABLE IF NOT EXISTS workflow_versions (workflowId TEXT NOT NULL, version INTEGER NOT NULL, definition TEXT NOT NULL, PRIMARY KEY(workflowId,version));
      CREATE TABLE IF NOT EXISTS workflow_admissions (workflowId TEXT NOT NULL, requestId TEXT NOT NULL, sessionId TEXT NOT NULL, conversationId TEXT NOT NULL, input TEXT NOT NULL, taskId INTEGER, PRIMARY KEY(workflowId,requestId));`);
  }
  private get db() {
    return this.harnesses.store.db;
  }
  list(projectId: string): WorkflowVersion[] {
    this.projects.assertWritable(projectId);
    return this.db
      .prepare(
        "SELECT w.*, v.definition FROM workflows w JOIN workflow_versions v ON v.workflowId=w.id AND v.version=w.version WHERE projectId=? ORDER BY w.id",
      )
      .all(projectId)
      .map((row) => ({
        id: String(row.id),
        projectId,
        version: Number(row.version),
        definition: JSON.parse(String(row.definition)),
        enabled: Boolean(row.enabled),
        sessionId: String(row.sessionId),
        conversationId: String(row.conversationId),
      }));
  }
  get(projectId: string, id: string) {
    const workflow = this.list(projectId).find((w) => w.id === id);
    if (!workflow)
      throw new HarnessError(404, "Workflow not found in this project.");
    return workflow;
  }
  async save(
    projectId: string,
    id: string,
    revision: number,
    definition: WorkflowDefinition,
    sessionId: string,
    conversationId: string,
    enabled: boolean,
  ) {
    this.projects.assertWritable(projectId);
    validateDefinition(definition);
    const scope = await this.harnesses.conversation(sessionId, conversationId);
    if (scope.record.projectId !== projectId)
      throw new HarnessError(400, "Choose a conversation in this project.");
    const nextAt =
      enabled && definition.trigger?.type === "cron"
        ? nextCron(
            definition.trigger.expression,
            definition.trigger.timezone,
            Date.now(),
          )
        : null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare("SELECT * FROM workflows WHERE id=?")
        .get(id);
      if (
        (current &&
          (current.projectId !== projectId ||
            Number(current.version) !== revision)) ||
        (!current && revision !== 0)
      )
        throw new HarnessError(409, "Workflow changed. Reload before saving.");
      const version = revision + 1;
      this.db
        .prepare("INSERT INTO workflow_versions VALUES (?,?,?)")
        .run(id, version, JSON.stringify(definition));
      this.db
        .prepare(
          "INSERT INTO workflows (id,projectId,version,sessionId,conversationId,enabled,nextAt) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,sessionId=excluded.sessionId,conversationId=excluded.conversationId,enabled=excluded.enabled,nextAt=excluded.nextAt",
        )
        .run(
          id,
          projectId,
          version,
          sessionId,
          conversationId,
          enabled ? 1 : 0,
          nextAt,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(projectId, id);
  }
  versions(projectId: string, id: string) {
    this.get(projectId, id);
    return this.db
      .prepare(
        "SELECT version,definition FROM workflow_versions WHERE workflowId=? ORDER BY version DESC",
      )
      .all(id)
      .map((row) => ({
        version: Number(row.version),
        definition: JSON.parse(String(row.definition)) as WorkflowDefinition,
      }));
  }
  async start(
    projectId: string,
    id: string,
    requestId: string,
    input: Record<string, string>,
    version?: number,
  ) {
    const workflow = this.get(projectId, id);
    let admission = this.db
      .prepare(
        "SELECT * FROM workflow_admissions WHERE workflowId=? AND requestId=?",
      )
      .get(id, requestId);
    if (!admission) {
      if (version !== undefined && workflow.version !== version)
        throw new HarnessError(
          409,
          "Workflow changed before trigger admission.",
        );
      const job = await this.harnesses.captureWorkflowJob(
        workflow.sessionId,
        workflow.conversationId,
      );
      this.db
        .prepare(
          "INSERT OR IGNORE INTO workflow_admissions (workflowId,requestId,sessionId,conversationId,input) VALUES (?,?,?,?,?)",
        )
        .run(
          id,
          requestId,
          workflow.sessionId,
          workflow.conversationId,
          JSON.stringify({
            runKey: `${id}:${workflow.sessionId}:${requestId}`,
            workflowId: id,
            version: workflow.version,
            definition: workflow.definition,
            input,
            job,
          }),
        );
      admission = this.db
        .prepare(
          "SELECT * FROM workflow_admissions WHERE workflowId=? AND requestId=?",
        )
        .get(id, requestId);
    }
    if (!admission) throw new Error("Workflow admission could not be saved.");
    const sessionId = String(admission.sessionId);
    const conversationId = String(admission.conversationId);
    if (admission.taskId !== null)
      return { id: Number(admission.taskId), sessionId, conversationId };
    const { harness, conversation } = await this.harnesses.conversation(
      sessionId,
      conversationId,
    );
    const key = `workflow:${id}:${requestId}`;
    const inputSnapshot = JSON.parse(String(admission.input)) as WorkflowInput;
    const taskId = await conversation.commit(async (tx) => {
      const request = await tx.doc(ReviewRequests, conversation.id, key, null);
      if (request.taskId !== undefined) return request.taskId;
      request.taskId = await tx.createTask(WorkflowRun, inputSnapshot, {
        ownership: { kind: "conversation" },
        background: true,
      });
      return request.taskId;
    }, context);
    this.db
      .prepare(
        "UPDATE workflow_admissions SET taskId=? WHERE workflowId=? AND requestId=?",
      )
      .run(taskId, id, requestId);
    harness.resume();
    return { id: taskId, sessionId, conversationId };
  }
  private async scope(projectId: string, sessionId: string, taskId: number) {
    const { record, harness } = await this.harnesses.session(sessionId);
    if (record.projectId !== projectId)
      throw new HarnessError(404, "Run not found in this project.");
    const task = await harness.getTask(taskId as TaskId<boolean>, context);
    if (!task || task.kind !== WorkflowRun.definition.name)
      throw new HarnessError(404, "Workflow run not found.");
    return { harness, task: task as typeof task & { input: WorkflowInput } };
  }
  async run(
    projectId: string,
    sessionId: string,
    taskId: number,
  ): Promise<WorkflowRunView> {
    const { harness, task } = await this.scope(projectId, sessionId, taskId);
    const run = await harness.commit(
      (tx) =>
        tx.doc(WorkflowRuns, task.conversationId, String(taskId), null).then(
          (doc) =>
            copyJson(doc) as {
              outputs: Record<string, string>;
              approval?: WorkflowRunView["approval"];
              decisions?: WorkflowRunView["decisions"];
              error?: string;
            },
        ),
      context,
    );
    const terminal = task.state.status === "terminal";
    return {
      id: taskId,
      workflowId: task.input.workflowId,
      version: task.input.version,
      sessionId,
      conversationId: String(task.conversationId),
      status: terminal
        ? task.state.outcome?.status === "completed"
          ? task.state.outcome.result === true
            ? "completed"
            : "failed"
          : task.state.outcome?.status
        : run.approval
          ? "approval"
          : task.state.status,
      ...(!terminal &&
        "checkpoint" in task.state && {
          step: (task.state.checkpoint as { step?: string }).step,
        }),
      ...run,
      ...(terminal &&
        !run.error && { error: taskDiagnostic(task.state.outcome) }),
    };
  }
  async runs(projectId: string) {
    this.projects.assertWritable(projectId);
    const runs: WorkflowRunView[] = [];
    for (const record of this.harnesses.store.list(projectId)) {
      const { harness } = await this.harnesses.session(record.sessionId);
      const page = await harness.commit(
        (tx) =>
          tx.scanTasks(
            {
              kind: WorkflowRun.definition.name,
              status: "terminal",
              order: "descending",
            },
            50,
          ),
        context,
      );
      const live = (await harness.inspect(context)).tasks
        .map((item) => item.record)
        .filter((task) => task.kind === WorkflowRun.definition.name);
      const ids = new Set([...live, ...page.items].map((task) => task.id));
      for (const id of ids)
        runs.push(await this.run(projectId, record.sessionId, id));
    }
    return runs;
  }
  async decide(
    projectId: string,
    sessionId: string,
    taskId: number,
    revision: string,
    decision: "approved" | "rejected",
    actor = "local-owner",
  ) {
    const { harness, task } = await this.scope(projectId, sessionId, taskId);
    const view = await this.run(projectId, sessionId, taskId);
    if (view.status !== "approval" || view.approval?.revision !== revision)
      throw new HarnessError(409, "Approval changed or is no longer waiting.");
    if (decision === "approved" && view.approval.action?.merge) {
      try {
        await this.github.verify(view.approval.action.merge);
      } catch (error) {
        throw new HarnessError(
          409,
          error instanceof Error ? error.message : "Pull request changed.",
        );
      }
    }
    await harness.commit(async (tx) => {
      const current = await tx.task(task.id);
      const doc = await tx.doc(
        WorkflowRuns,
        task.conversationId,
        String(taskId),
        null,
      );
      if (
        !current ||
        current.state.status === "terminal" ||
        doc.approval?.revision !== revision
      )
        throw new HarnessError(409, "Approval changed or run ended.");
      if (doc.approval.decision && doc.approval.decision !== decision)
        throw new HarnessError(409, "Approval already decided.");
      if (!doc.approval.decision) {
        doc.decisions ??= [];
        doc.decisions.push({
          step: doc.approval.action?.id ?? "approval",
          revision,
          decision,
          actor,
          at: Date.now(),
          ...(doc.approval.action?.merge && {
            merge: { ...doc.approval.action.merge },
          }),
        });
      }
      doc.approval.decision = decision;
    }, context);
    return this.run(projectId, sessionId, taskId);
  }
  async invalidate(
    projectId: string,
    sessionId: string,
    taskId: number,
    revision: string,
  ) {
    const { harness, task } = await this.scope(projectId, sessionId, taskId);
    await harness.commit(async (tx) => {
      const run = await tx.doc(
        WorkflowRuns,
        task.conversationId,
        String(taskId),
        null,
      );
      if (run.approval?.revision !== revision || run.approval.decision)
        throw new HarnessError(409, "Approval changed or already decided.");
      run.approval.revision = approvalRevision({
        revision,
        nonce: randomUUID(),
      });
      run.approval.invalidated = "Previous approval revision was withdrawn.";
    }, context);
    return this.run(projectId, sessionId, taskId);
  }
  async stop(projectId: string, sessionId: string, taskId: number) {
    const { harness, task } = await this.scope(projectId, sessionId, taskId);
    await harness.abortTask(task.id, context);
    return this.run(projectId, sessionId, taskId);
  }
  async tick(now = Date.now()) {
    for (const pending of this.db
      .prepare(
        "SELECT a.workflowId,a.requestId,w.projectId FROM workflow_admissions a JOIN workflows w ON a.workflowId=w.id WHERE a.taskId IS NULL",
      )
      .all()) {
      try {
        await this.start(
          String(pending.projectId),
          String(pending.workflowId),
          String(pending.requestId),
          {},
        );
      } catch (error) {
        this.lastTriggerError =
          error instanceof Error ? error.message : "Pending admission failed.";
      }
    }
    const due = this.db
      .prepare(
        "SELECT id,projectId,version,nextAt FROM workflows WHERE enabled=1 AND nextAt<=?",
      )
      .all(now);
    for (const row of due) {
      try {
        const workflow = this.get(String(row.projectId), String(row.id));
        const trigger = workflow.definition.trigger;
        if (trigger?.type !== "cron") continue;
        const previous = await this.runs(workflow.projectId);
        if (
          !previous.some(
            (run) =>
              run.workflowId === workflow.id &&
              ![
                "completed",
                "failed",
                "aborted",
                "faulted",
                "orphaned",
              ].includes(run.status),
          )
        )
          await this.start(
            workflow.projectId,
            workflow.id,
            `cron:${row.version}:${row.nextAt}`,
            { scheduledAt: new Date(Number(row.nextAt)).toISOString() },
            Number(row.version),
          );
        this.db
          .prepare(
            "UPDATE workflows SET nextAt=? WHERE id=? AND version=? AND nextAt=?",
          )
          .run(
            nextCron(trigger.expression, trigger.timezone, now),
            workflow.id,
            row.version,
            row.nextAt,
          );
      } catch (error) {
        this.lastTriggerError =
          error instanceof Error ? error.message : "Trigger failed.";
      }
    }
  }
  startScheduler() {
    this.timer = setInterval(() => {
      if (!this.ticking)
        this.ticking = this.tick().finally(() => {
          this.ticking = undefined;
        });
    }, 1000);
    this.timer.unref();
  }
  async close() {
    clearInterval(this.timer);
    await this.ticking;
  }
}
