import { expect, it } from "vitest";
import { newTask, type Task } from "../src/lib/contracts";
import { DraftSaver } from "../src/lib/draft-saver";

it("recognizes undo before a write as already saved", () => {
  const task = newTask("undo");
  const saver = new DraftSaver(task, async (t) => t);
  expect(saver.isSaved({ ...task, rawText: "Правка" })).toBe(false);
  expect(saver.isSaved({ ...task, rawText: "" })).toBe(true);
});

it("saves an undo while an older request is still in flight using the latest version", async () => {
  const original = newTask("slow");
  let finish!: (task: Task) => void;
  const requests: Task[] = [];
  const saver = new DraftSaver(original, (task) => {
    requests.push(task);
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const changed = { ...original, rawText: "Правка" };
  const first = saver.save(changed);
  await Promise.resolve();
  await Promise.resolve();
  expect(saver.isSaved(original)).toBe(false);
  const undo = saver.save(original);
  finish({ ...changed, revision: 1, updatedAt: "version-2" });
  await first;
  await Promise.resolve();
  await Promise.resolve();
  expect(requests[1].updatedAt).toBe("version-2");
  expect(requests[1].revision).toBe(1);
  expect(requests[1].rawText).toBe("");
  finish({ ...original, revision: 2, updatedAt: "version-3" });
  await undo;
  expect(saver.isSaved(original)).toBe(true);
  expect(saver.saved.revision).toBe(2);
});

it("retains the prior version on failure and permits a safe retry", async () => {
  const original = newTask("retry");
  let fail = true;
  const saver = new DraftSaver(original, async (task) => {
    if (fail) throw new Error("offline");
    expect(task.updatedAt).toBe(original.updatedAt);
    return { ...task, updatedAt: "version-2" };
  });
  const changed = { ...original, rawText: "Текст" };
  await expect(saver.save(changed)).rejects.toThrow("offline");
  expect(saver.isSaved(changed)).toBe(false);
  fail = false;
  await saver.save(changed);
  expect(saver.isSaved(changed)).toBe(true);
});
