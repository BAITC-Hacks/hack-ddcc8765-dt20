import { randomUUID } from "node:crypto";
import { z } from "zod";
import { newTask, taskSchema, type Task } from "../contracts";
import {
  listPublishedTasks,
  toPublishedTask,
  type CatalogFilters,
} from "../catalog";
import { confirmTask, publishTask } from "../task-state";
import {
  proposalSchema,
  type Proposal,
  type TeamProfile,
} from "../collaboration-contracts";
export { proposalSchema } from "../collaboration-contracts";
export type { Proposal } from "../collaboration-contracts";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const notFound = () =>
  new ApiError(404, "NOT_FOUND", "Объект не найден или недоступен.");
const conflict = () =>
  new ApiError(
    409,
    "CONFLICT",
    "Данные изменились. Обновите страницу и повторите действие.",
  );
export const draftSchema = taskSchema
  .pick({
    rawText: true,
    industry: true,
    draft: true,
    questions: true,
    answers: true,
    step: true,
    source: true,
  })
  .strict();
export type Team = TeamProfile;
export type StoredTask = { task: Task; owner: string; revision: number };
export type StoredProposal = { proposal: Proposal; revision: number };
export interface Repository {
  createTask(owner: string, task: Task): Promise<void>;
  getTask(id: string): Promise<StoredTask | null>;
  listTasks(owner?: string): Promise<Task[]>;
  saveTask(id: string, revision: number, task: Task): Promise<boolean>;
  listTeams(): Promise<Team[]>;
  createProposal(proposal: Proposal): Promise<void>;
  getProposal(id: string): Promise<StoredProposal | null>;
  listProposals(): Promise<Proposal[]>;
  saveProposal(
    id: string,
    revision: number,
    proposal: Proposal,
  ): Promise<boolean>;
}

export class TaskService {
  constructor(
    private repo: Repository,
    private owner: string,
  ) {}
  private async owned(id: string) {
    z.uuid().parse(id);
    const row = await this.repo.getTask(id);
    if (!row || row.owner !== this.owner) throw notFound();
    return row;
  }
  async create(body: unknown) {
    const input = draftSchema.extend({ id: z.uuid() }).parse(body);
    await this.repo.createTask(this.owner, { ...newTask(input.id), ...input });
    return this.get(input.id);
  }
  async get(id: string) {
    return (await this.owned(id)).task;
  }
  async businessTasks() {
    return (await this.repo.listTasks(this.owner)).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  async save(id: string, body: unknown) {
    const { expectedRevision, ...input } = draftSchema
      .extend({ expectedRevision: z.number().int().nonnegative() })
      .parse(body);
    const row = await this.owned(id);
    if (expectedRevision !== row.revision) throw conflict();
    const task = {
      ...row.task,
      ...input,
      revision: row.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    if (!(await this.repo.saveTask(id, row.revision, task))) throw conflict();
    return task;
  }
  async confirm(id: string, body: unknown) {
    const { expectedRevision } = z
      .object({
        acknowledged: z.literal(true),
        expectedRevision: z.number().int().nonnegative(),
      })
      .strict()
      .parse(body);
    return this.transition(id, expectedRevision, (task) =>
      confirmTask(task, true),
    );
  }
  async publish(id: string, body: unknown) {
    const { expectedRevision } = z
      .object({ expectedRevision: z.number().int().nonnegative() })
      .strict()
      .parse(body);
    return this.transition(id, expectedRevision, publishTask);
  }
  private async transition(
    id: string,
    expectedRevision: number,
    transform: (task: Task) => Task,
  ) {
    const row = await this.owned(id);
    if (row.revision !== expectedRevision) throw conflict();
    let task: Task;
    try {
      task = { ...transform(row.task), revision: row.revision + 1 };
    } catch {
      throw new ApiError(
        409,
        "INVALID_STATE",
        "Проверьте название и подтвердите текущую версию карточки.",
      );
    }
    if (!(await this.repo.saveTask(id, row.revision, task))) throw conflict();
    return task;
  }
  async catalog(filters: CatalogFilters) {
    return listPublishedTasks(await this.repo.listTasks(), filters);
  }
  async publicTask(id: string) {
    z.uuid().parse(id);
    const row = await this.repo.getTask(id);
    const task = row && toPublishedTask(row.task);
    if (!task) throw notFound();
    return task;
  }
  async teams() {
    const [teams, proposals] = await Promise.all([
      this.repo.listTeams(),
      this.repo.listProposals(),
    ]);
    return teams.map((t) => ({
      ...t,
      xp:
        proposals.filter(
          (p) => p.teamId === t.id && p.stageConfirmedAt !== null,
        ).length * 10,
    }));
  }
  async propose(taskId: string, body: unknown) {
    const input = proposalSchema
      .pick({
        teamId: true,
        idea: true,
        plan: true,
        deadline: true,
        prototypeUrl: true,
      })
      .strict()
      .parse(body);
    await this.publicTask(taskId);
    if (!(await this.repo.listTeams()).some((t) => t.id === input.teamId))
      throw notFound();
    const proposal: Proposal = {
      ...input,
      id: randomUUID(),
      taskId,
      status: "pending",
      resultDescription: null,
      resultUrl: null,
      stageConfirmedAt: null,
      createdAt: new Date().toISOString(),
    };
    await this.repo.createProposal(proposal);
    return proposal;
  }
  async proposals(taskId?: string) {
    if (taskId) await this.owned(taskId);
    const ids = new Set(
      (await this.repo.listTasks(this.owner)).map((t) => t.id),
    );
    return (await this.repo.listProposals()).filter(
      (p) => ids.has(p.taskId) && (!taskId || p.taskId === taskId),
    );
  }
  private async proposal(id: string) {
    z.uuid().parse(id);
    const row = await this.repo.getProposal(id);
    if (!row) throw notFound();
    await this.owned(row.proposal.taskId);
    return row;
  }
  private async saveProposal(row: StoredProposal, next: Proposal) {
    if (!(await this.repo.saveProposal(next.id, row.revision, next)))
      throw conflict();
    return next;
  }
  async decide(id: string, body: unknown) {
    const { status } = z
      .object({ status: z.enum(["accepted", "rejected"]) })
      .strict()
      .parse(body);
    const row = await this.proposal(id);
    if (row.proposal.stageConfirmedAt && status !== row.proposal.status)
      throw conflict();
    return this.saveProposal(row, { ...row.proposal, status });
  }
  async result(id: string, body: unknown) {
    const input = proposalSchema
      .pick({ resultDescription: true, resultUrl: true })
      .strict()
      .parse(body);
    const row = await this.proposal(id);
    if (row.proposal.status !== "accepted" || row.proposal.stageConfirmedAt)
      throw conflict();
    return this.saveProposal(row, { ...row.proposal, ...input });
  }
  async confirmStage(id: string, body: unknown) {
    z.object({ acknowledged: z.literal(true) })
      .strict()
      .parse(body);
    const row = await this.proposal(id);
    const p = row.proposal;
    if (
      p.status !== "accepted" ||
      !(p.resultDescription?.trim() || p.resultUrl)
    )
      throw conflict();
    if (p.stageConfirmedAt) return p;
    return this.saveProposal(row, {
      ...p,
      stageConfirmedAt: new Date().toISOString(),
    });
  }
}
