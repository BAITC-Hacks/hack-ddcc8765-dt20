import { z } from "zod";
import {
  contentSchema,
  scoreSchema,
  type Score,
  type Task,
  type TaskContent,
} from "./contracts";

export const publishedTaskSchema = z.object({
  id: z.string().min(1),
  confirmedContent: contentSchema,
  confirmedIndustry: z.string(),
  confirmedScore: scoreSchema,
  confirmedAt: z.string(),
  publishedAt: z.string(),
});

/** Public projection. Never send the editable Task object to the catalog. */
export type PublishedTask = {
  id: string;
  confirmedContent: TaskContent;
  confirmedIndustry: string;
  confirmedScore: Score;
  confirmedAt: string;
  publishedAt: string;
};

export type CatalogFilters = {
  industry?: string;
  level?: Score["level"];
};

export function toPublishedTask(task: Task): PublishedTask | null {
  if (
    !task.publishedAt ||
    !task.confirmedAt ||
    !task.confirmedContent ||
    task.confirmedIndustry === null ||
    !task.confirmedScore
  )
    return null;

  return structuredClone({
    id: task.id,
    confirmedContent: task.confirmedContent,
    confirmedIndustry: task.confirmedIndustry,
    confirmedScore: task.confirmedScore,
    confirmedAt: task.confirmedAt,
    publishedAt: task.publishedAt,
  });
}

export function listPublishedTasks(
  tasks: Task[],
  filters: CatalogFilters = {},
): PublishedTask[] {
  return tasks
    .map(toPublishedTask)
    .filter((task): task is PublishedTask => task !== null)
    .filter(
      (task) =>
        !filters.industry || task.confirmedIndustry === filters.industry,
    )
    .filter(
      (task) => !filters.level || task.confirmedScore.level === filters.level,
    )
    .sort(
      (a, b) =>
        b.confirmedScore.total - a.confirmedScore.total ||
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt) ||
        a.id.localeCompare(b.id, "en"),
    );
}
