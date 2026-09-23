import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { demoDataset } from "../src/lib/demo-data";
import { demoTasks, demoProposals } from "../src/lib/collaboration-fixtures";
import { newTask } from "../src/lib/contracts";

const TASKS = "sana-brief.tasks.v1";
const PROPOSALS = "sana-brief.proposals.v1";
let values: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "local");
  vi.stubEnv("NEXT_PUBLIC_COLLAB_FIXTURES", "0");
  values = new Map();
  let queue: Promise<unknown> = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: (_key: string, work: () => unknown) => {
        const result = queue.then(work);
        queue = result.catch(() => undefined);
        return result;
      },
    },
  });
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    },
    dispatchEvent: vi.fn(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("reads old arrays without losing results/XP and preserves concurrent edits from both adapters", async () => {
  const legacy = structuredClone(demoProposals);
  legacy[0].stageConfirmedAt = "2026-09-23T10:00:00.000Z";
  values.set(
    TASKS,
    JSON.stringify(Object.fromEntries(demoTasks().map((t) => [t.id, t]))),
  );
  const original = JSON.stringify(legacy);
  values.set(PROPOSALS, original);
  const { collaborationGateway: current } =
    await import("../src/lib/collaboration-gateway");
  const { collaboration: old } =
    await import("../src/lib/collaboration-client");
  expect((await current.teams())[0].xp).toBe(10);
  expect(values.get(PROPOSALS)).toBe(original);
  await Promise.all([
    current.decide(legacy[1].id, "accepted"),
    old.decide(legacy[2].id, "rejected"),
  ]);
  const stored = JSON.parse(values.get(PROPOSALS)!);
  expect(Object.keys(stored)).toHaveLength(5);
  expect(stored[legacy[0].id].proposal).toEqual(legacy[0]);
  expect(stored[legacy[1].id].proposal.status).toBe("accepted");
  expect(stored[legacy[2].id].proposal.status).toBe("rejected");
  await old.submitResult(legacy[1].id, {
    resultDescription: "Проверенный прототип",
    resultUrl: null,
  });
  expect(
    (await current.teamProposals(legacy[1].teamId)).find(
      (p) => p.id === legacy[1].id,
    )?.resultDescription,
  ).toBe("Проверенный прототип");
});

it("does not seed data unless requested or fixture mode is enabled", async () => {
  const { collaborationGateway: collab } =
    await import("../src/lib/collaboration-gateway");
  expect(await collab.catalog()).toEqual([]);
  expect(await collab.proposals()).toEqual([]);
  expect(values.size).toBe(0);
});

it("does not silently collapse duplicate IDs or overwrite corrupt legacy arrays", async () => {
  const raw = JSON.stringify([demoProposals[0], demoProposals[0]]);
  values.set(PROPOSALS, raw);
  const { collaborationGateway: collab, resetDemoData } =
    await import("../src/lib/collaboration-gateway");
  await expect(collab.seedDemo()).rejects.toThrow("не изменены");
  await expect(resetDemoData()).rejects.toThrow("не изменены");
  expect(values.get(PROPOSALS)).toBe(raw);
  expect(values.has(TASKS)).toBe(false);
});

it("keeps newer examples intact when legacy fixture mode is enabled", async () => {
  const data = demoDataset();
  values.set(
    TASKS,
    JSON.stringify(Object.fromEntries(data.tasks.map((t) => [t.id, t]))),
  );
  values.set(
    PROPOSALS,
    JSON.stringify(
      Object.fromEntries(
        data.proposals.map((p) => [p.id, { proposal: p, revision: 0 }]),
      ),
    ),
  );
  vi.stubEnv("NEXT_PUBLIC_COLLAB_FIXTURES", "1");
  const { collaborationGateway: collab } =
    await import("../src/lib/collaboration-gateway");
  const catalog = await collab.catalog();
  expect(catalog).toHaveLength(5);
  expect(
    catalog.find((t) => t.id === data.tasks[0].id)?.confirmedContent,
  ).toEqual(data.tasks[0].confirmedContent);
  // Legacy response subjects differ, so they must not be attached by shared ID.
  expect(await collab.proposals()).toEqual(data.proposals);
});

it("resets only sample IDs, retaining custom tasks, responses and their XP with a recovery copy", async () => {
  const { collaborationGateway: collab, resetDemoData } =
    await import("../src/lib/collaboration-gateway");
  const { gateway } = await import("../src/lib/gateway");
  await collab.seedDemo();
  const custom = newTask(crypto.randomUUID());
  await gateway.create(custom);
  const data = demoDataset();
  const proposal = await collab.propose(data.tasks[0].id, {
    teamId: data.teams[0].id,
    idea: "Своя идея",
    plan: "Свой план",
    deadline: "Неделя",
    prototypeUrl: null,
  });
  await collab.decide(proposal.id, "accepted");
  await collab.result(proposal.id, "Готовый результат", null);
  await collab.confirmStage(proposal.id);
  await collab.confirmStage(data.proposals[0].id);
  const before = { tasks: values.get(TASKS), proposals: values.get(PROPOSALS) };
  await resetDemoData();
  expect(await gateway.get(custom.id)).toEqual(custom);
  const saved = (await collab.proposals()).find((p) => p.id === proposal.id)!;
  expect(saved.stageConfirmedAt).toBeTruthy();
  expect(saved.resultDescription).toBe("Готовый результат");
  expect((await collab.teams())[0].xp).toBe(10);
  expect(await gateway.list()).toHaveLength(11);
  expect(await collab.proposals()).toHaveLength(6);
  expect(JSON.parse(values.get("sana-brief.demo-backup.v1")!)).toEqual(before);
});

it("restores task storage when a reset cannot write proposals", async () => {
  const { collaborationGateway: collab, resetDemoData } =
    await import("../src/lib/collaboration-gateway");
  const { gateway } = await import("../src/lib/gateway");
  await collab.seedDemo();
  const task = await gateway.get(demoDataset().tasks[0].id);
  await gateway.save({ ...task, rawText: "Редактирование примера" });
  const before = { tasks: values.get(TASKS), proposals: values.get(PROPOSALS) };
  const set = window.localStorage.setItem;
  window.localStorage.setItem = (key, value) => {
    if (key === PROPOSALS) throw new Error("Quota exceeded");
    set(key, value);
  };
  await expect(resetDemoData()).rejects.toThrow("Не удалось сохранить");
  expect(values.get(TASKS)).toBe(before.tasks);
  expect(values.get(PROPOSALS)).toBe(before.proposals);
});

it("undoes a reset without losing later custom records", async () => {
  const {
    collaborationGateway: collab,
    resetDemoData,
    restoreDemoData,
    hasDemoBackup,
  } = await import("../src/lib/collaboration-gateway");
  const { gateway } = await import("../src/lib/gateway");
  await collab.seedDemo();
  const task = await gateway.get(demoDataset().tasks[0].id);
  const edited = await gateway.save({
    ...task,
    rawText: "Мои изменения в примере",
  });
  await collab.confirmStage(demoDataset().proposals[0].id);
  await resetDemoData();
  expect(hasDemoBackup()).toBe(true);
  const later = await gateway.create(newTask(crypto.randomUUID()));
  await restoreDemoData();
  expect(await gateway.get(task.id)).toEqual(edited);
  expect(await gateway.get(later.id)).toEqual(later);
  expect((await collab.teams())[0].xp).toBe(10);
  expect(hasDemoBackup()).toBe(false);
});

it("keeps a task reachable when a custom response was created after resetting an empty demo", async () => {
  const {
    collaborationGateway: collab,
    resetDemoData,
    restoreDemoData,
  } = await import("../src/lib/collaboration-gateway");
  await resetDemoData();
  const data = demoDataset();
  const proposal = await collab.propose(data.tasks[0].id, {
    teamId: data.teams[0].id,
    idea: "Своя идея",
    plan: "Свой план",
    deadline: "Неделя",
    prototypeUrl: null,
  });
  await restoreDemoData();
  expect((await collab.task(proposal.taskId)).id).toBe(proposal.taskId);
  expect(await collab.proposals(proposal.taskId)).toEqual([proposal]);
});

it("keeps empty results from clearing previously submitted work", async () => {
  const { collaborationGateway: collab } =
    await import("../src/lib/collaboration-gateway");
  await collab.seedDemo();
  const proposal = demoDataset().proposals[0];
  await expect(collab.result(proposal.id, "  ", null)).rejects.toThrow(
    "Добавьте описание",
  );
  expect(
    (await collab.proposals()).find((p) => p.id === proposal.id)
      ?.resultDescription,
  ).toBe(proposal.resultDescription);
});

it("supports participant 3's own-results methods over HTTP and reports invalid JSON in Russian", async () => {
  vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "api");
  const proposal = demoDataset().proposals[0];
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json([proposal]))
    .mockResolvedValueOnce(Response.json(proposal))
    .mockResolvedValueOnce(new Response("<html>error</html>"));
  vi.stubGlobal("fetch", fetcher);
  const { collaboration } = await import("../src/lib/collaboration-client");
  expect(await collaboration.ownProposals(proposal.teamId)).toEqual([proposal]);
  expect(
    await collaboration.submitResult(proposal.id, {
      resultDescription: proposal.resultDescription,
      resultUrl: proposal.resultUrl,
    }),
  ).toEqual(proposal);
  expect(fetcher.mock.calls[0][0]).toBe(
    `/api/student/proposals?teamId=${proposal.teamId}`,
  );
  expect(fetcher.mock.calls[1][0]).toBe(`/api/proposals/${proposal.id}/result`);
  expect(fetcher.mock.calls[1][1].method).toBe("PATCH");
  await expect(collaboration.catalog()).rejects.toThrow("некорректный ответ");
  expect(values.size).toBe(0);
});
