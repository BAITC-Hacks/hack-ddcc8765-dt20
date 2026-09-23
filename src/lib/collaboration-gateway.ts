import { z } from "zod";
import {
  dataMode,
  readLocal,
  writeLocal,
  withLocalLock,
  request,
} from "./gateway";
import { publishedTaskSchema, type CatalogFilters } from "./catalog";
import {
  proposalSchema,
  teamSchema,
  type Proposal,
} from "./collaboration-contracts";
import {
  TaskService,
  type Repository,
  type StoredProposal,
} from "./task-service";
import { DEMO_TEAMS } from "./demo-data";

const PROPOSALS_KEY = "sana-brief.proposals.v1";
const storedProposals = z.record(
  z.string(),
  z.object({
    proposal: proposalSchema,
    revision: z.number().int().nonnegative(),
  }),
);
function readProposals(): Record<string, StoredProposal> {
  const value = window.localStorage.getItem(PROPOSALS_KEY);
  if (!value) return {};
  const parsed = storedProposals.safeParse(
    (() => {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success)
    throw new Error(
      "Не удалось прочитать отклики. Сохранённые данные не изменены.",
    );
  return parsed.data;
}
function writeProposal(row: StoredProposal) {
  const records = readProposals();
  records[row.proposal.id] = row;
  try {
    window.localStorage.setItem(PROPOSALS_KEY, JSON.stringify(records));
  } catch {
    throw new Error(
      "Не удалось сохранить отклик в браузере. Освободите место и повторите действие.",
    );
  }
  window.dispatchEvent(new Event("sana:tasks-changed"));
}
const repository: Repository = {
  async createTask(_owner, task) {
    if (!readLocal()[task.id]) writeLocal(task);
  },
  async getTask(id) {
    const task = readLocal()[id];
    return task
      ? { task, owner: "demo-business", revision: task.revision }
      : null;
  },
  async listTasks() {
    return Object.values(readLocal());
  },
  async saveTask(id, revision, task) {
    if (readLocal()[id]?.revision !== revision) return false;
    writeLocal(task);
    return true;
  },
  async listTeams() {
    return structuredClone(DEMO_TEAMS);
  },
  async createProposal(proposal) {
    if (!readProposals()[proposal.id]) writeProposal({ proposal, revision: 0 });
  },
  async getProposal(id) {
    return readProposals()[id] ?? null;
  },
  async listProposals() {
    return Object.values(readProposals()).map((row) => row.proposal);
  },
  async saveProposal(id, revision, proposal) {
    if (readProposals()[id]?.revision !== revision) return false;
    writeProposal({ proposal, revision: revision + 1 });
    return true;
  },
};
const local = new TaskService(repository, "demo-business");
const remote = <T>(
  path: string,
  schema: z.ZodType<T>,
  method = "GET",
  body?: unknown,
) => request(path, schema, method, body, false);
export type ProposalInput = Pick<
  Proposal,
  "teamId" | "idea" | "plan" | "deadline" | "prototypeUrl"
>;
export const collaborationGateway = {
  catalog(filters: CatalogFilters = {}) {
    const query = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => Boolean(v)),
    ).toString();
    return dataMode === "local"
      ? local.catalog(filters)
      : remote(
          `/api/tasks${query ? `?${query}` : ""}`,
          z.array(publishedTaskSchema),
        );
  },
  task(id: string) {
    return dataMode === "local"
      ? local.publicTask(id)
      : remote(`/api/catalog/${encodeURIComponent(id)}`, publishedTaskSchema);
  },
  teams() {
    return dataMode === "local"
      ? local.teams()
      : remote("/api/teams", z.array(teamSchema));
  },
  proposals(taskId?: string) {
    return dataMode === "local"
      ? local.proposals(taskId)
      : remote(
          `/api/business/proposals${taskId ? `?taskId=${encodeURIComponent(taskId)}` : ""}`,
          z.array(proposalSchema),
        );
  },
  teamProposals(teamId: string) {
    return dataMode === "local"
      ? local.teamProposals(teamId)
      : remote(
          `/api/student/proposals?teamId=${encodeURIComponent(teamId)}`,
          z.array(proposalSchema),
        );
  },
  propose(taskId: string, input: ProposalInput) {
    return dataMode === "local"
      ? withLocalLock(() => local.propose(taskId, input))
      : remote(
          `/api/tasks/${encodeURIComponent(taskId)}/proposals`,
          proposalSchema,
          "POST",
          input,
        );
  },
  decide(id: string, status: "accepted" | "rejected") {
    return dataMode === "local"
      ? withLocalLock(() => local.decide(id, { status }))
      : remote(
          `/api/proposals/${encodeURIComponent(id)}`,
          proposalSchema,
          "PATCH",
          { status },
        );
  },
  result(id: string, resultDescription: string, resultUrl: string | null) {
    const body = { resultDescription, resultUrl };
    return dataMode === "local"
      ? withLocalLock(() => local.result(id, body))
      : remote(
          `/api/proposals/${encodeURIComponent(id)}/result`,
          proposalSchema,
          "PATCH",
          body,
        );
  },
  confirmStage(id: string) {
    return dataMode === "local"
      ? withLocalLock(() => local.confirmStage(id, { acknowledged: true }))
      : remote(
          `/api/proposals/${encodeURIComponent(id)}/confirm-stage`,
          proposalSchema,
          "POST",
          { acknowledged: true },
        );
  },
  seedDemo() {
    return dataMode === "local"
      ? withLocalLock(() => local.seedDemo())
      : remote("/api/demo/seed", z.object({ ok: z.literal(true) }), "POST", {
          acknowledged: true,
        });
  },
};
