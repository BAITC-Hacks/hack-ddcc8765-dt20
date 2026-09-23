import { contentSchema, type Task } from "./contracts";
import { calculateScore, meaningful } from "./scoring";
import { calculateReviewedScore, qualityInputKey } from "./quality";

export function hasUnconfirmedChanges(task: Task): boolean {
  const reviewed = task.qualityReview?.inputKey === qualityInputKey(task.draft, task.industry)
    ? calculateReviewedScore(task.draft, task.qualityReview) : null;
  const reviewChanged = reviewed !== null && reviewed.groups.some(group => {
    const confirmed = task.confirmedScore?.groups.find(item => item.id === group.id);
    return !confirmed || confirmed.earned !== group.earned ||
      confirmed.missing.length !== group.missing.length ||
      group.missing.some(item => !confirmed.missing.some(other => other.field === item.field && other.label === item.label && other.points === item.points));
  });
  return (
    !task.confirmedContent ||
    JSON.stringify(task.draft) !== JSON.stringify(task.confirmedContent) ||
    task.industry !== task.confirmedIndustry ||
    reviewChanged
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
    confirmedScore: task.qualityReview?.inputKey === qualityInputKey(draft, task.industry)
      ? calculateReviewedScore(draft, task.qualityReview) : calculateScore(draft),
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
