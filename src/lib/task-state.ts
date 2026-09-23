import { contentSchema, type Task } from "./contracts";
import { calculateScore, meaningful } from "./scoring";

export function hasUnconfirmedChanges(task: Task): boolean {
  return (
    !task.confirmedContent ||
    JSON.stringify(task.draft) !== JSON.stringify(task.confirmedContent) ||
    task.industry !== task.confirmedIndustry
  );
}
export function confirmTask(task: Task, acknowledged: boolean): Task {
  if (!acknowledged)
    throw new Error("Подтвердите, что проверили сведения в карточке.");
  const draft = contentSchema.parse(task.draft);
  if (!meaningful(draft.title))
    throw new Error("Укажите название задачи перед подтверждением.");
  return {
    ...task,
    confirmedContent: { ...draft },
    confirmedIndustry: task.industry,
    confirmedAt: new Date().toISOString(),
    confirmedScore: calculateScore(draft),
    updatedAt: new Date().toISOString(),
  };
}
export function publishTask(task: Task): Task {
  if (!task.confirmedContent || hasUnconfirmedChanges(task))
    throw new Error("Сначала подтвердите текущую версию карточки.");
  return {
    ...task,
    publishedAt: task.publishedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
