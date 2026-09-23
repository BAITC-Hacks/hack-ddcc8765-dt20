import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  Repository,
  StoredTask,
  StoredProposal,
} from "../src/lib/task-service";
import { DEMO_TEAMS } from "../src/lib/demo-data";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ repo: null as unknown as Repository }));
vi.mock("@/lib/server/database", () => ({
  createRepository: () => state.repo,
}));
import { GET, POST, PATCH } from "../src/app/api/[...path]/route";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DEMO_ACCESS_PASSWORD", "");
  const tasks = new Map<string, StoredTask>();
  const proposals = new Map<string, StoredProposal>();
  state.repo = {
    async createTask(owner, task) {
      if (!tasks.has(task.id))
        tasks.set(task.id, { owner, task: structuredClone(task), revision: 0 });
    },
    async getTask(id) {
      return structuredClone(tasks.get(id) ?? null);
    },
    async listTasks(owner) {
      return structuredClone(
        [...tasks.values()]
          .filter((t) => !owner || t.owner === owner)
          .map((t) => t.task),
      );
    },
    async saveTask(id, revision, task) {
      const row = tasks.get(id);
      if (!row || row.revision !== revision) return false;
      tasks.set(id, {
        ...row,
        task: structuredClone(task),
        revision: revision + 1,
      });
      return true;
    },
    async listTeams() {
      return structuredClone(DEMO_TEAMS);
    },
    async createProposal(proposal) {
      if (!proposals.has(proposal.id))
        proposals.set(proposal.id, {
          proposal: structuredClone(proposal),
          revision: 0,
        });
    },
    async getProposal(id) {
      return structuredClone(proposals.get(id) ?? null);
    },
    async listProposals() {
      return structuredClone([...proposals.values()].map((p) => p.proposal));
    },
    async saveProposal(id, revision, proposal) {
      if (proposals.get(id)?.revision !== revision) return false;
      proposals.set(id, {
        revision: revision + 1,
        proposal: structuredClone(proposal),
      });
      return true;
    },
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function http(path: string, method = "GET", body?: unknown) {
  const request = new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (method === "GET" ? GET : method === "POST" ? POST : PATCH)(request);
}

it("routes seed, public catalog, proposals, manual decisions, results and XP through real HTTP handlers", async () => {
  expect(
    (await http("/api/demo/seed", "POST", { acknowledged: true })).status,
  ).toBe(200);
  expect(
    (await http("/api/demo/seed", "POST", { acknowledged: true })).status,
  ).toBe(200);
  const catalog = await (await http("/api/tasks")).json();
  expect(catalog).toHaveLength(5);
  expect(catalog[0].confirmedScore.total).toBe(100);
  expect(catalog.every((t: object) => !("draft" in t))).toBe(true);
  const task = catalog.at(-1);
  const team = DEMO_TEAMS[4];
  const response = await http(`/api/tasks/${task.id}/proposals`, "POST", {
    teamId: team.id,
    idea: "Прототип очереди",
    plan: "Форма, статусы, тестирование",
    deadline: "7 дней",
    prototypeUrl: null,
  });
  expect(response.status).toBe(200);
  const proposal = await response.json();
  expect(
    (
      await http(`/api/proposals/${proposal.id}/confirm-stage`, "POST", {
        acknowledged: true,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await http(`/api/proposals/${proposal.id}`, "PATCH", {
        status: "accepted",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await http(`/api/proposals/${proposal.id}/result`, "PATCH", {
        resultDescription: "Проверен прототип",
        resultUrl: null,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await http(`/api/proposals/${proposal.id}/confirm-stage`, "POST", {
        acknowledged: true,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await http(`/api/proposals/${proposal.id}/confirm-stage`, "POST", {
        acknowledged: true,
      })
    ).status,
  ).toBe(200);
  expect(
    (await (await http("/api/teams")).json()).find(
      (t: { id: string }) => t.id === team.id,
    ).xp,
  ).toBe(10);
  const own = await (
    await http(`/api/student/proposals?teamId=${team.id}`)
  ).json();
  expect(own).toHaveLength(2);
  expect(own.every((p: { teamId: string }) => p.teamId === team.id)).toBe(true);
  expect((await http("/api/student/proposals?teamId=broken")).status).toBe(400);
});

it("requires seed acknowledgement but allows production requests without login", async () => {
  expect((await http("/api/demo/seed", "POST", {})).status).toBe(400);
  expect(await state.repo.listTasks()).toHaveLength(0);
  vi.stubEnv("NODE_ENV", "production");
  const seeded = await http("/api/demo/seed", "POST", { acknowledged: true });
  expect(seeded.status).toBe(200);
  expect(seeded.headers.has("www-authenticate")).toBe(false);
  vi.stubEnv("DEMO_ACCESS_PASSWORD", "test-password");
  const proposals = await http(`/api/student/proposals?teamId=${DEMO_TEAMS[0].id}`);
  expect(proposals.status).toBe(200);
  expect(proposals.headers.has("www-authenticate")).toBe(false);
  const health = await http("/api/health");
  expect(health.status).toBe(200);
  expect(health.headers.has("www-authenticate")).toBe(false);
});
