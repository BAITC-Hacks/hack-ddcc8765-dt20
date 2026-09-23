import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newTask } from "../src/lib/contracts";
import { gateway } from "../src/lib/gateway";

let storage: Map<string, string>;
beforeEach(() => {
  let queue: Promise<unknown> = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: vi.fn((_name: string, work: () => unknown) => {
        const result = queue.then(work);
        queue = result.catch(() => undefined);
        return result;
      }),
    },
  });
  storage = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    dispatchEvent: vi.fn(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("persistent local workflow", () => {
  it("rejects stale saves and leaves both independent edits recoverable", async () => {
    await gateway.create(newTask("two-tabs"));
    const a = await gateway.get("two-tabs");
    const b = await gateway.get("two-tabs");
    a.draft.users = "Менеджер";
    b.draft.deadline = "7 дней";
    const results = await Promise.allSettled([
      gateway.save(a),
      gateway.save(b),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect((results[1] as PromiseRejectedResult).reason.name).toBe(
      "SaveConflictError",
    );
    expect((await gateway.get("two-tabs")).draft.users).toBe("Менеджер");
    expect(b.draft.deadline).toBe("7 дней");
    await gateway.create({ ...newTask("recovered"), draft: b.draft });
    expect((await gateway.get("recovered")).draft.deadline).toBe("7 дней");
    expect(await gateway.list()).toHaveLength(2);
  });
  it("does not confirm or publish a version changed by another editor", async () => {
    const task = newTask("confirm-race");
    task.draft.title = "Прототип";
    await gateway.create(task);
    const confirmed = await gateway.confirm(task);
    await gateway.save({
      ...confirmed,
      draft: { ...confirmed.draft, users: "Менеджер" },
    });
    await expect(gateway.confirm(confirmed)).rejects.toThrow("другой вкладке");
    await expect(gateway.publish(confirmed)).rejects.toThrow("другой вкладке");
    expect((await gateway.get(task.id)).publishedAt).toBeNull();
  });
  it("increments versions even when two writes happen in the same millisecond", async () => {
    vi.useFakeTimers();
    const task = await gateway.create(newTask("fast"));
    const a = await gateway.save({ ...task, rawText: "Первая версия" });
    const b = await gateway.save({ ...a, rawText: "Вторая версия" });
    expect(b.updatedAt > a.updatedAt).toBe(true);
    await expect(gateway.save({ ...a, rawText: "Устаревшая" })).rejects.toThrow(
      "другой вкладке",
    );
  });
  it("fails safely when cross-tab locking is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    await expect(gateway.create(newTask("unsafe"))).rejects.toThrow("HTTPS");
    expect(storage.size).toBe(0);
  });
  it("survives reload, preserves published content and accepts a zero-score publication", async () => {
    const task = newTask("saved");
    task.draft.title = "Нужен прототип";
    await gateway.create(task);
    expect((await gateway.get(task.id)).draft.title).toBe("Нужен прототип");
    const confirmed = await gateway.confirm(task);
    const published = await gateway.publish(confirmed);
    await gateway.save({
      ...published,
      draft: { ...published.draft, users: "Менеджер" },
    });
    const restored = await gateway.get(task.id);
    expect(restored.draft.users).toBe("Менеджер");
    expect(restored.confirmedContent?.users).toBe("");
    expect(restored.confirmedScore?.total).toBe(0);
    expect(restored.publishedAt).toBeTruthy();
    expect((await gateway.list()).length).toBe(1);
  });
  it("does not overwrite corrupt saved records", async () => {
    storage.set("sana-brief.tasks.v1", "broken json");
    await expect(gateway.create(newTask("new"))).rejects.toThrow(
      "не перезаписаны",
    );
    expect(storage.get("sana-brief.tasks.v1")).toBe("broken json");
  });
  it("surfaces storage failure instead of reporting a successful save", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      },
      dispatchEvent: vi.fn(),
    });
    await expect(gateway.create(newTask("full"))).rejects.toThrow(
      "не разрешил сохранение",
    );
  });
});
