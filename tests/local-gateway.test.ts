import { beforeEach, describe, expect, it, vi } from "vitest";
import { newTask } from "../src/lib/contracts";
import { gateway } from "../src/lib/gateway";

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    dispatchEvent: vi.fn(),
  });
});
describe("persistent local workflow", () => {
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
