import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};

describe("participant 3 collaboration adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_DATA_MODE = "local";
    process.env.NEXT_PUBLIC_COLLAB_FIXTURES = "1";
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
      localStorage: storage(),
      dispatchEvent: () => true,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_DATA_MODE;
    delete process.env.NEXT_PUBLIC_COLLAB_FIXTURES;
  });

  it("seeds five published levels and five distinct drafts without hiding weak tasks", async () => {
    const { collaboration } = await import("../src/lib/collaboration-client");
    const catalog = await collaboration.catalog();
    expect(catalog).toHaveLength(5);
    expect(new Set(catalog.map((task) => task.confirmedScore.level))).toEqual(
      new Set(["draft", "working", "ready", "priority"]),
    );
    expect(
      catalog.find((task) => task.confirmedScore.total === 0),
    ).toBeTruthy();
    expect(await collaboration.businessTasks()).toHaveLength(10);
    const weak = catalog.find((task) => task.confirmedScore.total === 0)!;
    const proposal = await collaboration.submitProposal(weak.id, {
      teamId: (await collaboration.teams())[0].id,
      idea: "Проверить процесс",
      plan: "Собрать макет",
      deadline: "Неделя",
      prototypeUrl: null,
    });
    expect(proposal.status).toBe("pending");
    expect(
      (await collaboration.businessProposals(weak.id)).some(
        (item) => item.id === proposal.id,
      ),
    ).toBe(true);
    const draft = (await collaboration.businessTasks()).find(
      (task) => !task.publishedAt,
    )!;
    await expect(collaboration.publicTask(draft.id)).rejects.toThrow(
      "не найден или недоступен",
    );
  });

  it("accepts two teams independently and awards XP once for a confirmed result", async () => {
    const { collaboration } = await import("../src/lib/collaboration-client");
    const catalog = await collaboration.catalog();
    const bakery = catalog.find((task) =>
      task.confirmedContent.title.includes("пекарни"),
    )!;
    const proposals = await collaboration.businessProposals(bakery.id);
    expect(proposals).toHaveLength(2);
    await collaboration.decide(proposals[1].id, "accepted");
    expect(
      (await collaboration.businessProposals(bakery.id)).filter(
        (item) => item.status === "accepted",
      ),
    ).toHaveLength(2);
    await collaboration.confirmStage(proposals[0].id);
    await collaboration.confirmStage(proposals[0].id);
    expect(
      (await collaboration.teams()).find(
        (team) => team.id === proposals[0].teamId,
      )?.xp,
    ).toBe(10);
    await expect(collaboration.confirmStage(proposals[1].id)).rejects.toThrow(
      "дождитесь результата",
    );
  });

  it("keeps builder publication in the same local catalog and protects confirmed content", async () => {
    const { collaboration } = await import("../src/lib/collaboration-client");
    const { gateway } = await import("../src/lib/gateway");
    const { newTask } = await import("../src/lib/contracts");
    let task = newTask("30000000-0000-4000-8000-000000000001");
    task.draft.title = "Новая слабая задача";
    task = await gateway.create(task);
    task = await gateway.confirm(task);
    await gateway.publish(task);
    const before = await collaboration.publicTask(task.id);
    let current = await gateway.get(task.id);
    current.draft.need = "Новое неподтверждённое требование";
    current = await gateway.save(current);
    expect(
      (await collaboration.publicTask(task.id)).confirmedContent.need,
    ).toBe("");
    await gateway.confirm(current);
    expect(
      (await collaboration.publicTask(task.id)).confirmedContent.need,
    ).toBe("Новое неподтверждённое требование");
    expect(before.confirmedScore.total).toBe(0);
  });

  it("uses public HTTP routes and never treats server errors as local success", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_DATA_MODE = "api";
    const requests = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: "База недоступна", code: "STORAGE_UNAVAILABLE" },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ id: "x", rawText: "private" }));
    vi.stubGlobal("fetch", requests);
    const { collaboration } = await import("../src/lib/collaboration-client");
    await expect(collaboration.catalog()).rejects.toThrow("База недоступна");
    await expect(collaboration.publicTask("task-id")).rejects.toThrow(
      "некорректный ответ",
    );
    expect(requests.mock.calls[0][0]).toBe("/api/tasks");
    expect(requests.mock.calls[1][0]).toBe("/api/catalog/task-id");
    expect(requests.mock.calls[0][1].credentials).toBe("include");
    expect(window.localStorage.getItem("sana-brief.proposals.v1")).toBeNull();
  });
});
