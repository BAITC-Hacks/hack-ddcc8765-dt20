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
import { DEMO_TEAMS, demoDataset } from "./demo-data";
import {
  DEMO_TASK_IDS,
  demoTasks,
  demoProposals,
} from "./collaboration-fixtures";
import { taskSchema, type Task } from "./contracts";

const PROPOSALS_KEY = "sana-brief.proposals.v1";
const TASKS_KEY = "sana-brief.tasks.v1";
export const fixturesEnabled =
  dataMode === "local" && process.env.NEXT_PUBLIC_COLLAB_FIXTURES === "1";
const storedProposals = z.record(
  z.string(),
  z.object({
    proposal: proposalSchema,
    revision: z.number().int().nonnegative(),
  }),
);
function readProposals(
  value = window.localStorage.getItem(PROPOSALS_KEY),
): Record<string, StoredProposal> {
  if (!value) return {};
  const json: unknown = (() => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  })();
  // Participant 3 stored an array under the same key. Convert only after
  // validating every entry; the next locked write persists the new format.
  if (Array.isArray(json)) {
    const legacy = z.array(proposalSchema).safeParse(json);
    if (
      legacy.success &&
      new Set(legacy.data.map((p) => p.id)).size === legacy.data.length
    )
      return Object.fromEntries(
        legacy.data.map((proposal) => [proposal.id, { proposal, revision: 0 }]),
      );
  }
  const parsed = storedProposals.safeParse(json);
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

function browserDemo() {
  return fixturesEnabled
    ? { tasks: demoTasks(), proposals: demoProposals }
    : demoDataset();
}

function storeDemo(
  tasks: Record<string, Task>,
  proposals: Record<string, StoredProposal>,
  backup = false,
) {
  const storage = window.localStorage;
  const previous = {
    tasks: storage.getItem(TASKS_KEY),
    proposals: storage.getItem(PROPOSALS_KEY),
  };
  const nextTasks = JSON.stringify(tasks);
  const nextProposals = JSON.stringify(proposals);
  if (previous.tasks === nextTasks && previous.proposals === nextProposals)
    return;
  // Keep a recovery copy before an explicit reset, including previous XP/results.
  if (backup)
    storage.setItem("sana-brief.demo-backup.v1", JSON.stringify(previous));
  let tasksWritten = false;
  try {
    storage.setItem(TASKS_KEY, nextTasks);
    tasksWritten = true;
    storage.setItem(PROPOSALS_KEY, nextProposals);
  } catch {
    if (tasksWritten) {
      if (previous.tasks === null) storage.removeItem(TASKS_KEY);
      else storage.setItem(TASKS_KEY, previous.tasks);
    }
    throw new Error(
      "Не удалось сохранить демопримеры. Проверьте свободное место в браузере.",
    );
  }
  window.dispatchEvent(new Event("sana:tasks-changed"));
}

function seedBrowserDemo(reset = false) {
  const tasks = readLocal();
  const proposals = readProposals();
  const data = browserDemo();
  if (reset) {
    const current = demoDataset();
    for (const id of [...DEMO_TASK_IDS, ...current.tasks.map((t) => t.id)])
      delete tasks[id];
    for (const proposal of [...demoProposals, ...current.proposals])
      delete proposals[proposal.id];
  }
  for (const task of data.tasks) tasks[task.id] ??= task;
  for (const proposal of data.proposals) {
    const sample = data.tasks.find((t) => t.id === proposal.taskId)!;
    // Historical demo sets share IDs but different subjects. Do not attach
    // a sample response to a different or edited task.
    if (
      JSON.stringify(tasks[proposal.taskId]?.confirmedContent) ===
      JSON.stringify(sample.confirmedContent)
    )
      proposals[proposal.id] ??= { proposal, revision: 0 };
  }
  storeDemo(tasks, proposals, reset);
  return { ok: true as const };
}

let seeding: Promise<unknown> | null = null;
async function ensureFixtures() {
  if (!fixturesEnabled) return;
  seeding ??= withLocalLock(() => seedBrowserDemo()).finally(() => {
    seeding = null;
  });
  await seeding;
}
async function readWithFixtures<T>(read: () => Promise<T>): Promise<T> {
  await ensureFixtures();
  return read();
}
async function writeWithFixtures<T>(write: () => Promise<T>): Promise<T> {
  await ensureFixtures();
  return withLocalLock(write);
}

/** Explicit UI confirmation is required before calling this local-only reset. */
export function resetDemoData() {
  if (dataMode !== "local")
    return Promise.reject(
      new Error("Сброс доступен только для локальных демопримеров."),
    );
  return withLocalLock(() => seedBrowserDemo(true));
}
export function hasDemoBackup() {
  return (
    dataMode === "local" &&
    window.localStorage.getItem("sana-brief.demo-backup.v1") !== null
  );
}
/** Undo only sample records; tasks/responses created after a reset are retained. */
export function restoreDemoData() {
  if (dataMode !== "local")
    return Promise.reject(
      new Error("Восстановление доступно только в локальном режиме."),
    );
  return withLocalLock(() => {
    const raw = window.localStorage.getItem("sana-brief.demo-backup.v1");
    if (!raw) throw new Error("Резервной копии демопримеров нет.");
    const backup = z
      .object({
        tasks: z.string().nullable(),
        proposals: z.string().nullable(),
      })
      .parse(JSON.parse(raw));
    const previousTasks = z
      .record(z.string(), taskSchema)
      .parse(JSON.parse(backup.tasks ?? "{}"));
    const previousProposals = readProposals(backup.proposals);
    const tasks = readLocal();
    const proposals = readProposals();
    const current = demoDataset();
    const sampleProposalIds = new Set(
      [...demoProposals, ...current.proposals].map((p) => p.id),
    );
    const referencedByUsers = new Set(
      Object.values(proposals)
        .filter(({ proposal }) => !sampleProposalIds.has(proposal.id))
        .map(({ proposal }) => proposal.taskId),
    );
    for (const id of [...DEMO_TASK_IDS, ...current.tasks.map((t) => t.id)]) {
      if (previousTasks[id]) tasks[id] = previousTasks[id];
      else if (!referencedByUsers.has(id)) delete tasks[id];
    }
    for (const { id } of [...demoProposals, ...current.proposals]) {
      if (previousProposals[id]) proposals[id] = previousProposals[id];
      else delete proposals[id];
    }
    storeDemo(tasks, proposals);
    window.localStorage.removeItem("sana-brief.demo-backup.v1");
    window.dispatchEvent(new Event("sana:tasks-changed"));
  });
}
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
      ? readWithFixtures(() => local.catalog(filters))
      : remote(
          `/api/tasks${query ? `?${query}` : ""}`,
          z.array(publishedTaskSchema),
        );
  },
  task(id: string) {
    return dataMode === "local"
      ? readWithFixtures(() => local.publicTask(id))
      : remote(`/api/catalog/${encodeURIComponent(id)}`, publishedTaskSchema);
  },
  teams() {
    return dataMode === "local"
      ? readWithFixtures(() => local.teams())
      : remote("/api/teams", z.array(teamSchema));
  },
  proposals(taskId?: string) {
    return dataMode === "local"
      ? readWithFixtures(() => local.proposals(taskId))
      : remote(
          `/api/business/proposals${taskId ? `?taskId=${encodeURIComponent(taskId)}` : ""}`,
          z.array(proposalSchema),
        );
  },
  teamProposals(teamId: string) {
    return dataMode === "local"
      ? readWithFixtures(() => local.teamProposals(teamId))
      : remote(
          `/api/student/proposals?teamId=${encodeURIComponent(teamId)}`,
          z.array(proposalSchema),
        );
  },
  propose(taskId: string, input: ProposalInput) {
    return dataMode === "local"
      ? writeWithFixtures(() => local.propose(taskId, input))
      : remote(
          `/api/tasks/${encodeURIComponent(taskId)}/proposals`,
          proposalSchema,
          "POST",
          input,
        );
  },
  decide(id: string, status: "accepted" | "rejected") {
    return dataMode === "local"
      ? writeWithFixtures(() => local.decide(id, { status }))
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
      ? writeWithFixtures(() => local.result(id, body))
      : remote(
          `/api/proposals/${encodeURIComponent(id)}/result`,
          proposalSchema,
          "PATCH",
          body,
        );
  },
  confirmStage(id: string) {
    return dataMode === "local"
      ? writeWithFixtures(() => local.confirmStage(id, { acknowledged: true }))
      : remote(
          `/api/proposals/${encodeURIComponent(id)}/confirm-stage`,
          proposalSchema,
          "POST",
          { acknowledged: true },
        );
  },
  seedDemo() {
    return dataMode === "local"
      ? withLocalLock(() => seedBrowserDemo())
      : remote("/api/demo/seed", z.object({ ok: z.literal(true) }), "POST", {
          acknowledged: true,
        });
  },
};
