import { z } from "zod";
import {
  cardResponseSchema,
  questionsResponseSchema,
  taskSchema,
  type DraftInput,
  type Task,
} from "./contracts";
import { fallbackCard, fallbackQuestions } from "./assistance";
import { confirmTask, publishTask } from "./task-state";
import { fallbackQualityReview, qualityInputKey } from "./quality";

const STORAGE_KEY = "sana-brief.tasks.v1";
export const dataMode =
  process.env.NEXT_PUBLIC_DATA_MODE === "api" ? "api" : "local";
const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
function readLocal(): Record<string, Task> {
  const value = window.localStorage.getItem(STORAGE_KEY);
  if (!value) return {};
  try {
    return z.record(z.string(), taskSchema).parse(JSON.parse(value));
  } catch {
    throw new Error(
      "Не удалось прочитать сохранённые задачи. Данные не перезаписаны. Обратитесь к разработчику или откройте приложение в другом профиле браузера.",
    );
  }
}
function writeLocal(task: Task): Task {
  const tasks = readLocal();
  tasks[task.id] = taskSchema.parse(task);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    throw new Error(
      "Браузер не разрешил сохранение. Проверьте доступ к хранилищу; оставьте эту вкладку открытой, чтобы не потерять текст.",
    );
  }
  window.dispatchEvent(new Event("sana:tasks-changed"));
  return task;
}
export function draftInput(task: Task): DraftInput {
  const { rawText, industry, draft, questions, answers, step, source } = task;
  return { rawText, industry, draft, questions, answers, step, source };
}
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? "Задача изменилась в другой вкладке. Скопируйте несохранённый текст и обновите страницу."
          : response.status === 429
            ? "Лимит AI-проверок исчерпан. Подождите минуту и повторите действие."
          : response.status === 401
            ? "Войдите в демонстрационный стенд и повторите действие."
          : response.status === 503
            ? "Сервис временно недоступен. Проверьте подключение сервера к базе и настройку демостенда."
          : response.status === 404
            ? "Сервер не нашёл данные или нужный обработчик. Проверьте подключение API."
            : "Сервер не сохранил изменения. Попробуйте ещё раз.",
      );
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success)
      throw new Error(
        "Сервер вернул некорректный ответ. Ваш текст сохранён в форме; повторите действие.",
      );
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error(
        "Сервер не ответил за 45 секунд. Повторите действие — введённые данные остались в форме.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Нет связи с сервером. Проверьте интернет и повторите действие.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const gateway = {
  async create(task: Task): Promise<Task> {
    return dataMode === "local"
      ? writeLocal(task)
      : request("/api/tasks", taskSchema, "POST", {
          id: task.id,
          ...draftInput(task),
        });
  },
  async get(id: string): Promise<Task> {
    if (dataMode === "api")
      return request(`/api/tasks/${encodeURIComponent(id)}`, taskSchema);
    const task = readLocal()[id];
    if (!task)
      throw new Error(
        "Задача не найдена в этом браузере. Откройте её на устройстве, где она создана, или создайте новую.",
      );
    return task;
  },
  async list(): Promise<Task[]> {
    if (dataMode === "api")
      return request("/api/business/tasks", z.array(taskSchema));
    return Object.values(readLocal()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  },
  async save(task: Task): Promise<Task> {
    if (dataMode === "api")
      return request(
        `/api/tasks/${encodeURIComponent(task.id)}/draft`,
        taskSchema,
        "PATCH",
        { ...draftInput(task), expectedRevision: task.revision },
      );
    const current = readLocal()[task.id] ?? task;
    return writeLocal({
      ...current,
      ...draftInput(task),
      qualityReview: current.qualityReview?.inputKey === qualityInputKey(task.draft, task.industry) ? current.qualityReview : null,
      updatedAt: new Date().toISOString(),
    });
  },
  async questions(task: Task) {
    if (dataMode === "api")
      return request("/api/ai/questions", questionsResponseSchema, "POST", {
        rawText: task.rawText,
        industry: task.industry,
        content: task.draft,
      });
    return {
      questions: fallbackQuestions(task.rawText, task.draft),
      source: "fallback" as const,
    };
  },
  async card(task: Task) {
    if (dataMode === "api")
      return request("/api/ai/card", cardResponseSchema, "POST", {
        rawText: task.rawText,
        industry: task.industry,
        content: task.draft,
        questions: task.questions,
        answers: task.answers,
      });
    return { content: fallbackCard(task), source: "fallback" as const };
  },
  async review(task: Task): Promise<Task> {
    if (dataMode === "api") return request(`/api/tasks/${encodeURIComponent(task.id)}/review`, taskSchema, "POST", { expectedRevision: task.revision });
    const current = await this.get(task.id);
    return writeLocal({ ...current, qualityReview: fallbackQualityReview(current.draft, current.industry) });
  },
  async confirm(task: Task): Promise<Task> {
    if (dataMode === "api")
      return request(
        `/api/tasks/${encodeURIComponent(task.id)}/confirm`,
        taskSchema,
        "POST",
        { acknowledged: true, expectedRevision: task.revision },
      );
    const current = await this.get(task.id);
    return writeLocal(confirmTask({ ...current, qualityReview: current.qualityReview ?? fallbackQualityReview(current.draft, current.industry) }, true));
  },
  async publish(task: Task): Promise<Task> {
    if (dataMode === "api")
      return request(
        `/api/tasks/${encodeURIComponent(task.id)}/publish`,
        taskSchema,
        "POST",
        { expectedRevision: task.revision },
      );
    return writeLocal(publishTask(await this.get(task.id)));
  },
};
