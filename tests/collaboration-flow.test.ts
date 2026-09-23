import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { collaborationGateway as collab } from "../src/lib/collaboration-gateway";
import { gateway } from "../src/lib/gateway";
import { demoDataset } from "../src/lib/demo-data";
import { newTask, taskSchema } from "../src/lib/contracts";
import {
  proposalSchema,
  teamProfileSchema,
} from "../src/lib/collaboration-contracts";
import { calculateScore } from "../src/lib/scoring";

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  let queue: Promise<unknown> = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: (_name: string, work: () => unknown) => {
        const result = queue.then(work);
        queue = result.catch(() => undefined);
        return result;
      },
    },
  });
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    dispatchEvent: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());
const input = (teamId: string) => ({
  teamId,
  idea: "Форма и доска заявок",
  plan: "Изучить примеры, собрать прототип, проверить результаты",
  deadline: "7 дней",
  prototypeUrl: "https://example.com/prototype",
});

describe("complete collaboration workflow", () => {
  it("provides five drafts, five public cards covering all levels, five valid teams and proposals", () => {
    const data = demoDataset();
    expect(data.tasks.filter((t) => !t.publishedAt)).toHaveLength(5);
    expect(
      new Set(
        data.tasks
          .filter((t) => !t.publishedAt)
          .map((t) => calculateScore(t.draft).total),
      ).size,
    ).toBeGreaterThanOrEqual(3);
    const publicTasks = data.tasks.filter((t) => t.publishedAt);
    expect(publicTasks).toHaveLength(5);
    expect(new Set(publicTasks.map((t) => t.confirmedScore!.level))).toEqual(
      new Set(["draft", "working", "ready", "priority"]),
    );
    expect(data.teams).toHaveLength(5);
    expect(data.proposals).toHaveLength(5);
    data.tasks.forEach((t) => {
      taskSchema.parse(t);
      if (t.confirmedContent)
        expect(t.confirmedScore).toEqual(calculateScore(t.confirmedContent));
    });
    data.teams.forEach((t) => teamProfileSchema.parse(t));
    data.proposals.forEach((p) => proposalSchema.parse(p));
  });
  it("adds examples repeatedly without overwriting edits or decisions", async () => {
    await collab.seedDemo();
    const task = (await gateway.list())[0];
    await gateway.save({ ...task, rawText: "Правки владельца" });
    const proposal = (await collab.proposals())[1];
    await collab.decide(proposal.id, "rejected");
    await Promise.all([collab.seedDemo(), collab.seedDemo()]);
    expect(await gateway.list()).toHaveLength(10);
    expect(await collab.proposals()).toHaveLength(5);
    expect((await gateway.get(task.id)).rawText).toBe("Правки владельца");
    expect(
      (await collab.proposals()).find((p) => p.id === proposal.id)?.status,
    ).toBe("rejected");
  });
  it("publishes at zero, accepts unlimited proposals and several teams, awards XP exactly once", async () => {
    let task = newTask(crypto.randomUUID());
    task.draft.title = "Новая проверочная задача";
    task = await gateway.create(task);
    task = await gateway.confirm(task);
    task = await gateway.publish(task);
    expect((await collab.catalog())[0].confirmedScore.total).toBe(0);
    const [team1, team2] = await collab.teams();
    const proposals = await Promise.all([
      collab.propose(task.id, input(team1.id)),
      collab.propose(task.id, input(team2.id)),
      collab.propose(task.id, input(team1.id)),
    ]);
    expect(await collab.proposals(task.id)).toHaveLength(3);
    await expect(collab.confirmStage(proposals[0].id)).rejects.toThrow();
    await expect(
      collab.result(proposals[0].id, "Результат", null),
    ).rejects.toThrow();
    await Promise.all([
      collab.decide(proposals[0].id, "accepted"),
      collab.decide(proposals[1].id, "accepted"),
      collab.decide(proposals[2].id, "rejected"),
    ]);
    await expect(collab.confirmStage(proposals[0].id)).rejects.toThrow();
    await collab.result(
      proposals[0].id,
      "Собрана форма, выполнены проверки",
      "https://example.com/result",
    );
    await Promise.all([
      collab.confirmStage(proposals[0].id),
      collab.confirmStage(proposals[0].id),
    ]);
    expect((await collab.teams()).find((t) => t.id === team1.id)?.xp).toBe(10);
    expect((await collab.teams()).find((t) => t.id === team2.id)?.xp).toBe(0);
    expect(
      (await collab.proposals()).filter((p) => p.status === "accepted"),
    ).toHaveLength(2);
    await expect(collab.decide(proposals[0].id, "rejected")).rejects.toThrow();
    await expect(
      collab.result(proposals[0].id, "Подмена результата", null),
    ).rejects.toThrow();
    expect(await collab.teamProposals(team1.id)).toHaveLength(2);
  });
  it("keeps unconfirmed text private and reorders only after confirmation; filters can be cleared", async () => {
    await collab.seedDemo();
    const task = (await collab.catalog()).at(-1)!;
    let draft = await gateway.get(task.id);
    draft = await gateway.save({
      ...draft,
      draft: { ...demoDataset().tasks[1].draft, title: "Обновлённая задача" },
    });
    expect((await collab.task(task.id)).confirmedContent.title).toBe(
      task.confirmedContent.title,
    );
    expect(await collab.catalog({ industry: "Логистика" })).toHaveLength(1);
    expect(await collab.catalog({ level: "ready" })).toHaveLength(1);
    expect(
      await collab.catalog({ industry: "Логистика", level: "priority" }),
    ).toHaveLength(0);
    await gateway.confirm(draft);
    expect((await collab.task(task.id)).confirmedScore.total).toBe(100);
    expect((await collab.catalog()).slice(0, 2).map((t) => t.id)).toContain(
      task.id,
    );
    expect(await collab.catalog()).toHaveLength(5);
    expect(await collab.task(task.id)).not.toHaveProperty("draft");
  });
  it("rejects unknown teams, unpublished tasks, empty proposals and unsafe links", async () => {
    await collab.seedDemo();
    const data = demoDataset();
    const team = data.teams[0];
    const task = data.tasks[0];
    await expect(
      collab.propose(data.tasks[5].id, input(team.id)),
    ).rejects.toThrow();
    await expect(
      collab.propose(task.id, input(crypto.randomUUID())),
    ).rejects.toThrow();
    await expect(
      collab.propose(task.id, { ...input(team.id), idea: "   " }),
    ).rejects.toThrow();
    await expect(
      collab.propose(task.id, {
        ...input(team.id),
        prototypeUrl: "javascript:alert(1)",
      }),
    ).rejects.toThrow();
    expect(await collab.proposals()).toHaveLength(5);
  });
  it("keeps corrupt proposal data intact and surfaces storage failures", async () => {
    storage.set("sana-brief.proposals.v1", "broken");
    await expect(collab.proposals()).rejects.toThrow("не изменены");
    expect(storage.get("sana-brief.proposals.v1")).toBe("broken");
    storage.clear();
    await collab.seedDemo();
    window.localStorage.setItem = () => {
      throw new Error("Quota exceeded");
    };
    await expect(
      collab.propose(
        demoDataset().tasks[0].id,
        input(demoDataset().teams[0].id),
      ),
    ).rejects.toThrow("Не удалось сохранить");
    expect(await collab.proposals()).toHaveLength(5);
  });
});
