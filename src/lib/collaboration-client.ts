import { z } from "zod";
import { contentSchema, scoreSchema, taskSchema, type Score, type Task } from "./contracts";
import { proposalSchema, teamSchema, type Proposal, type Team } from "./collaboration-contracts";
import { listPublishedTasks, toPublishedTask, type CatalogFilters, type PublishedTask } from "./catalog";
import { dataMode, gateway } from "./gateway";
import { DEMO_TASK_IDS, demoProposals, demoTasks, demoTeams } from "./collaboration-fixtures";

const publishedSchema = z.object({
  id: z.string(), confirmedContent: contentSchema, confirmedIndustry: z.string(),
  confirmedScore: scoreSchema, confirmedAt: z.string(), publishedAt: z.string(),
}).strict();
const proposalsKey = "sana-brief.proposals.v1";
const taskStorageKey = "sana-brief.tasks.v1";
export const collaborationMode = dataMode === "api" ? "api" : process.env.NEXT_PUBLIC_COLLAB_FIXTURES === "1" ? "fixtures" : "local";
export const modeLabel = collaborationMode === "api" ? "Общий сервер" : collaborationMode === "fixtures" ? "Демонстрационные данные" : "Локальные данные · только этот браузер";
export type ProposalInput = Pick<Proposal, "teamId" | "idea" | "plan" | "deadline" | "prototypeUrl">;
export type ResultInput = Pick<Proposal, "resultDescription" | "resultUrl">;

export interface CollaborationAdapter {
  catalog(filters?: CatalogFilters): Promise<PublishedTask[]>;
  publicTask(id: string): Promise<PublishedTask>;
  teams(): Promise<Team[]>;
  businessTasks(): Promise<Task[]>;
  businessProposals(taskId?: string): Promise<Proposal[]>;
  ownProposals(teamId: string): Promise<Proposal[]>;
  submitProposal(taskId: string, input: ProposalInput): Promise<Proposal>;
  decide(id: string, status: "accepted" | "rejected"): Promise<Proposal>;
  submitResult(id: string, input: ResultInput): Promise<Proposal>;
  confirmStage(id: string): Promise<Proposal>;
}

async function request<T>(path: string, schema: z.ZodType<T>, method = "GET", body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path, {
      method, credentials: "include", cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) {
      let detail: unknown;
      try { detail = await response.json(); } catch { /* status remains authoritative */ }
      const parsed = z.object({ error: z.string(), code: z.string() }).safeParse(detail);
      throw new Error(parsed.success ? parsed.data.error : `Запрос не выполнен (HTTP ${response.status}).`);
    }
    let json: unknown;
    try { json = await response.json(); } catch {
      throw new Error("Сервер вернул неожиданный ответ. Данные не сохранены в интерфейсе.");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new Error("Сервер вернул неожиданный ответ. Данные не сохранены в интерфейсе.");
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Сервер не ответил за 20 секунд. Проверьте состояние перед повторной отправкой.");
    if (error instanceof TypeError) throw new Error("Нет связи с сервером. Проверьте подключение и состояние операции.");
    throw error;
  } finally { clearTimeout(timer); }
}

const api: CollaborationAdapter = {
  catalog(filters = {}) {
    const query = new URLSearchParams();
    if (filters.industry) query.set("industry", filters.industry);
    if (filters.level) query.set("level", filters.level);
    return request(`/api/tasks${query.size ? `?${query}` : ""}`, z.array(publishedSchema));
  },
  publicTask(id) { return request(`/api/catalog/${encodeURIComponent(id)}`, publishedSchema); },
  teams() { return request("/api/teams", z.array(teamSchema)); },
  businessTasks() { return request("/api/business/tasks", z.array(taskSchema)); },
  businessProposals(taskId) {
    const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
    return request(`/api/business/proposals${query}`, z.array(proposalSchema));
  },
  ownProposals() {
    throw new Error("Сервер пока не предоставляет команде чтение собственных откликов. Нужен отдельный маршрут с проверкой команды.");
  },
  submitProposal(taskId, input) {
    return request(`/api/tasks/${encodeURIComponent(taskId)}/proposals`, proposalSchema, "POST", input);
  },
  decide(id, status) {
    return request(`/api/proposals/${encodeURIComponent(id)}`, proposalSchema, "PATCH", { status });
  },
  submitResult() {
    throw new Error("Передача результата от команды требует серверного маршрута с проверкой её прав. Бизнесовый маршрут не используется от лица команды.");
  },
  confirmStage(id) {
    return request(`/api/proposals/${encodeURIComponent(id)}/confirm-stage`, proposalSchema, "POST", { acknowledged: true });
  },
};

let seeding: Promise<void> | null = null;
async function seedFixtures() {
  if (collaborationMode !== "fixtures") return;
  if (!seeding) seeding = (async () => {
    const existing = new Set((await gateway.list()).map((task) => task.id));
    for (const task of demoTasks()) if (!existing.has(task.id)) await gateway.create(task);
  })().finally(() => { seeding = null; });
  await seeding;
}
function readProposals(): Proposal[] {
  const value = window.localStorage.getItem(proposalsKey);
  if (!value) return collaborationMode === "fixtures" ? structuredClone(demoProposals) : [];
  let json: unknown;
  try { json = JSON.parse(value); } catch {
    throw new Error("Сохранённые отклики повреждены. Данные не перезаписаны.");
  }
  const parsed = z.array(proposalSchema).safeParse(json);
  if (!parsed.success) throw new Error("Сохранённые отклики повреждены. Данные не перезаписаны.");
  return collaborationMode === "fixtures"
    ? [...demoProposals.filter((sample) => !parsed.data.some((item) => item.id === sample.id)), ...parsed.data]
    : parsed.data;
}
function writeProposals(proposals: Proposal[]) {
  window.localStorage.setItem(proposalsKey, JSON.stringify(proposals));
  window.dispatchEvent(new Event("sana:proposals-changed"));
}
function updateProposal(id: string, change: (proposal: Proposal) => Proposal): Proposal {
  const proposals = readProposals();
  const index = proposals.findIndex((proposal) => proposal.id === id);
  if (index < 0) throw new Error("Отклик не найден.");
  proposals[index] = proposalSchema.parse(change(proposals[index]));
  writeProposals(proposals);
  return proposals[index];
}
const local: CollaborationAdapter = {
  async catalog(filters = {}) { await seedFixtures(); return listPublishedTasks(await gateway.list(), filters); },
  async publicTask(id) {
    await seedFixtures();
    const task = (await gateway.list()).find((item) => item.id === id);
    const published = task && toPublishedTask(task);
    if (!published) throw new Error("Задача не опубликована или недоступна.");
    return published;
  },
  async teams() {
    const proposals = readProposals();
    return demoTeams.map((team) => ({
      ...team,
      xp: proposals.filter((proposal) => proposal.teamId === team.id && proposal.stageConfirmedAt !== null).length * 10,
    }));
  },
  async businessTasks() { await seedFixtures(); return gateway.list(); },
  async businessProposals(taskId) {
    const proposals = readProposals();
    return taskId ? proposals.filter((proposal) => proposal.taskId === taskId) : proposals;
  },
  async ownProposals(teamId) { return readProposals().filter((proposal) => proposal.teamId === teamId); },
  async submitProposal(taskId, input) {
    await this.publicTask(taskId);
    if (!demoTeams.some((team) => team.id === input.teamId)) throw new Error("Выберите команду из списка.");
    const proposal = proposalSchema.parse({
      ...input, id: crypto.randomUUID(), taskId, status: "pending", resultDescription: null,
      resultUrl: null, stageConfirmedAt: null, createdAt: new Date().toISOString(),
    });
    writeProposals([...readProposals(), proposal]);
    return proposal;
  },
  async decide(id, status) {
    return updateProposal(id, (proposal) => {
      if (proposal.stageConfirmedAt && proposal.status !== status)
        throw new Error("Подтверждённый этап нельзя отклонить.");
      return { ...proposal, status };
    });
  },
  async submitResult(id, input) {
    return updateProposal(id, (proposal) => {
      if (proposal.status !== "accepted" || proposal.stageConfirmedAt)
        throw new Error("Результат можно передать только по принятому и неподтверждённому отклику.");
      if (!input.resultDescription?.trim() && !input.resultUrl)
        throw new Error("Добавьте описание или ссылку на результат.");
      return { ...proposal, ...input };
    });
  },
  async confirmStage(id) {
    return updateProposal(id, (proposal) => {
      if (proposal.status !== "accepted" || !(proposal.resultDescription?.trim() || proposal.resultUrl))
        throw new Error("Для подтверждения примите отклик и дождитесь результата.");
      return proposal.stageConfirmedAt ? proposal : { ...proposal, stageConfirmedAt: new Date().toISOString() };
    });
  },
};
export const collaboration: CollaborationAdapter = collaborationMode === "api" ? api : local;

/** Removes only stable sample IDs; user-created tasks and responses are retained. */
export function resetDemoData() {
  if (collaborationMode !== "fixtures") throw new Error("Сброс доступен только для демонстрационных данных.");
  const raw = window.localStorage.getItem(taskStorageKey);
  if (raw) {
    const tasks = z.record(z.string(), taskSchema).parse(JSON.parse(raw));
    for (const id of DEMO_TASK_IDS) delete tasks[id];
    window.localStorage.setItem(taskStorageKey, JSON.stringify(tasks));
  }
  const own = readProposals().filter((proposal) => !demoProposals.some((sample) => sample.id === proposal.id));
  writeProposals(own);
  window.dispatchEvent(new Event("sana:tasks-changed"));
}
export function safeWebUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
export type ReadinessLevel = Score["level"];
