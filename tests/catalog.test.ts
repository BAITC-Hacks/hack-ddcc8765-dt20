import { describe, expect, it } from "vitest";
import { newTask } from "../src/lib/contracts";
import { confirmTask, publishTask } from "../src/lib/task-state";
import { listPublishedTasks, toPublishedTask } from "../src/lib/catalog";

function published(id: string, date = "2026-09-23T08:00:00.000Z") {
  const task = newTask(id);
  task.draft.title = "Задача пекарни";
  return { ...publishTask(confirmTask(task, true)), publishedAt: date };
}

describe("participant 3 catalog boundary", () => {
  it("includes a published zero-score task and excludes an unpublished draft", () => {
    const result = listPublishedTasks([newTask("draft"), published("public")]);
    expect(result.map((task) => task.id)).toEqual(["public"]);
    expect(result[0].confirmedScore.total).toBe(0);
  });

  it("exposes only the confirmed snapshot without private draft or answers", () => {
    const task = published("public");
    task.draft.title = "Неопубликованные изменения";
    task.industry = "Логистика";
    task.rawText = "Приватное описание";
    task.answers = { contact: "Приватный контакт" };
    const card = toPublishedTask(task)!;
    expect(card.confirmedContent.title).toBe("Задача пекарни");
    expect(card.confirmedIndustry).toBe("Другое");
    expect(card).not.toHaveProperty("draft");
    expect(card).not.toHaveProperty("answers");
    expect(card).not.toHaveProperty("rawText");
    card.confirmedContent.title = "Изменение на стороне потребителя";
    expect(task.confirmedContent?.title).toBe("Задача пекарни");
  });

  it("does not expose a record with publication but missing confirmation", () => {
    expect(
      toPublishedTask({ ...newTask("invalid"), publishedAt: "2026-09-23" }),
    ).toBeNull();
  });

  it("sorts by score, newest publication and id without changing source order", () => {
    const a = published("a");
    const b = published("b");
    const old = published("old", "2026-09-22T08:00:00.000Z");
    const high = published("high");
    high.draft.users = "Администраторы пекарни";
    const tasks = [old, b, confirmTask(high, true), a];
    expect(listPublishedTasks(tasks).map((task) => task.id)).toEqual([
      "high",
      "a",
      "b",
      "old",
    ]);
    expect(tasks.map((task) => task.id)).toEqual(["old", "b", "high", "a"]);
  });

  it("filters on confirmed industry and readiness, and clearing filters restores tasks", () => {
    const task = published("bakery");
    task.industry = "Производство";
    const confirmed = confirmTask(task, true);
    confirmed.industry = "Логистика";
    const tasks = [confirmed, published("other")];
    expect(
      listPublishedTasks(tasks, {
        industry: "Производство",
        level: "draft",
      }).map((t) => t.id),
    ).toEqual(["bakery"]);
    expect(listPublishedTasks(tasks, { level: "ready" })).toEqual([]);
    expect(listPublishedTasks(tasks)).toHaveLength(2);
  });
});
