import { beforeEach, describe, expect, it } from "vitest";
import { newTask, type Task } from "../src/lib/contracts";
import { draftInput } from "../src/lib/gateway";
import {
  TaskService,
  type Repository,
  type StoredTask,
  type StoredProposal,
  type Proposal,
} from "../src/lib/server/service";

const taskId = "10000000-0000-4000-8000-000000000001";
const teamId = "00000000-0000-4000-8000-000000000001";
class MemoryRepository implements Repository {
  tasks = new Map<string, StoredTask>();
  proposals = new Map<string, StoredProposal>();
  async createTask(owner: string, task: Task) {
    if (!this.tasks.has(task.id))
      this.tasks.set(task.id, {
        owner,
        revision: 0,
        task: structuredClone(task),
      });
  }
  async getTask(id: string) {
    return structuredClone(this.tasks.get(id) ?? null);
  }
  async listTasks(owner?: string) {
    return structuredClone(
      [...this.tasks.values()]
        .filter((r) => !owner || r.owner === owner)
        .map((r) => r.task),
    );
  }
  async saveTask(id: string, revision: number, task: Task) {
    const row = this.tasks.get(id);
    if (!row || row.revision !== revision) return false;
    this.tasks.set(id, {
      ...row,
      revision: revision + 1,
      task: structuredClone(task),
    });
    return true;
  }
  async listTeams() {
    return [1, 2].map((i) => ({
      id: `00000000-0000-4000-8000-00000000000${i}`,
      name: `Team ${i}`,
      interests: [],
      skills: [],
      technologies: [],
    }));
  }
  async createProposal(proposal: Proposal) {
    this.proposals.set(proposal.id, {
      proposal: structuredClone(proposal),
      revision: 0,
    });
  }
  async getProposal(id: string) {
    return structuredClone(this.proposals.get(id) ?? null);
  }
  async listProposals() {
    return structuredClone([...this.proposals.values()].map((r) => r.proposal));
  }
  async saveProposal(id: string, revision: number, proposal: Proposal) {
    const row = this.proposals.get(id);
    if (!row || row.revision !== revision) return false;
    this.proposals.set(id, {
      proposal: structuredClone(proposal),
      revision: revision + 1,
    });
    return true;
  }
}
let repo: MemoryRepository;
let service: TaskService;
function editable(task: Task) {
  return { ...draftInput(task), expectedRevision: task.revision };
}
async function confirmCurrent() {
  return service.confirm(taskId, {
    acknowledged: true,
    expectedRevision: (await service.get(taskId)).revision,
  });
}
async function publishCurrent() {
  return service.publish(taskId, {
    expectedRevision: (await service.get(taskId)).revision,
  });
}
async function create() {
  const t = newTask(taskId);
  t.draft.title = "Задача пекарни";
  return service.create({ id: taskId, ...draftInput(t) });
}
async function publish() {
  await create();
  await confirmCurrent();
  return publishCurrent();
}
beforeEach(() => {
  repo = new MemoryRepository();
  service = new TaskService(repo, "business-1");
});

describe("server task lifecycle", () => {
  it("does not confirm a draft changed since the user reviewed it", async () => {
    const reviewed = await create();
    await service.save(taskId, { ...editable(reviewed), rawText: "Правки другой вкладки" });
    await expect(service.confirm(taskId, { acknowledged: true, expectedRevision: reviewed.revision })).rejects.toMatchObject({ status: 409 });
    expect((await service.get(taskId)).confirmedAt).toBeNull();
  });
  it("rejects a stale browser snapshot after another tab has saved", async () => {
    const stale = await create();
    await service.save(taskId, { ...editable(stale), rawText: "Новая версия" });
    await expect(
      service.save(taskId, { ...draftInput(stale), expectedRevision: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await service.get(taskId)).rawText).toBe("Новая версия");
  });
  it("makes create idempotent without overwriting saved changes", async () => {
    const t = await create();
    await service.save(taskId, { ...editable(t), rawText: "Изменения" });
    expect((await create()).rawText).toBe("Изменения");
  });
  it("rejects forged score fields and other owners", async () => {
    const t = await create();
    await expect(
      service.save(taskId, { ...draftInput(t), confirmedScore: 100 }),
    ).rejects.toThrow();
    await expect(
      new TaskService(repo, "other").get(taskId),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("requires acknowledgment, publishes low scores and isolates later drafts", async () => {
    await create();
    await expect(
      service.confirm(taskId, { acknowledged: false }),
    ).rejects.toThrow();
    await expect(publishCurrent()).rejects.toMatchObject({
      status: 409,
    });
    await confirmCurrent();
    const t = await publishCurrent();
    expect(t.confirmedScore?.total).toBe(0);
    await service.save(taskId, {
      ...editable(t),
      draft: { ...t.draft, users: "Администраторы" },
    });
    expect((await service.catalog({}))[0].confirmedContent.users).toBe("");
    expect((await confirmCurrent()).confirmedScore?.total).toBe(10);
  });
  it("reports concurrent updates instead of silently overwriting", async () => {
    const t = await create();
    repo.saveTask = async () => false;
    await expect(service.save(taskId, editable(t))).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("proposals and stage XP", () => {
  const input = {
    teamId,
    idea: "Форма заказов",
    plan: "Собрать прототип",
    deadline: "7 дней",
    prototypeUrl: null,
  };
  it("requires a published task and an existing team", async () => {
    await create();
    await expect(service.propose(taskId, input)).rejects.toMatchObject({
      status: 404,
    });
    await confirmCurrent();
    await publishCurrent();
    await expect(
      service.propose(taskId, {
        ...input,
        teamId: "00000000-0000-4000-8000-000000000009",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("allows several teams to be accepted and awards XP only once", async () => {
    await publish();
    const a = await service.propose(taskId, input);
    const b = await service.propose(taskId, {
      ...input,
      teamId: "00000000-0000-4000-8000-000000000002",
    });
    await service.decide(a.id, { status: "accepted" });
    await service.decide(b.id, { status: "accepted" });
    await expect(
      service.confirmStage(a.id, { acknowledged: true }),
    ).rejects.toMatchObject({ status: 409 });
    await service.result(a.id, {
      resultDescription: "Прототип проверен на примерах",
      resultUrl: null,
    });
    const once = await service.confirmStage(a.id, { acknowledged: true });
    const twice = await service.confirmStage(a.id, { acknowledged: true });
    expect(twice.stageConfirmedAt).toBe(once.stageConfirmedAt);
    expect((await service.teams()).find((t) => t.id === teamId)?.xp).toBe(10);
    expect(
      (await service.proposals()).filter((p) => p.status === "accepted"),
    ).toHaveLength(2);
    await expect(
      service.decide(a.id, { status: "rejected" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.result(a.id, { resultDescription: "Подмена", resultUrl: null }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects result confirmation for unselected teams", async () => {
    await publish();
    const p = await service.propose(taskId, input);
    await expect(
      service.confirmStage(p.id, { acknowledged: true }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
