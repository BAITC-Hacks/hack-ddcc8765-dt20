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

const STORAGE_KEY = "sana-brief.tasks.v1";
export const dataMode =
  process.env.NEXT_PUBLIC_DATA_MODE === "api" ? "api" : "local";
const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
export class SaveConflictError extends Error {
  constructor() {
    super(
      "Эта задача уже изменена в другой вкладке. Ваш текст остался в форме. Сохраните его отдельной копией или откройте сохранённую версию.",
    );
    this.name = "SaveConflictError";
  }
}
export function withLocalLock<T>(work: () => T | Promise<T>): Promise<T> {
  if (!navigator.locks)
    return Promise.reject(
      new Error(
        "Для надёжного сохранения откройте приложение через HTTPS или localhost в современном браузере.",
      ),
    );
  // One lock for the whole map also protects concurrent creation of different tasks.
  return navigator.locks.request(STORAGE_KEY, work);
}
function nextUpdatedAt(current: Task): string {
  return new Date(
    Math.max(Date.now(), (Date.parse(current.updatedAt) || 0) + 1),
  ).toISOString();
}
function currentVersion(task: Task): Task {
  const current = readLocal()[task.id];
  if (!current || current.updatedAt !== task.updatedAt)
    throw new SaveConflictError();
  return current;
}
export function readLocal(): Record<string, Task> {
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
export function writeLocal(task: Task): Task {
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
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  method = "GET",
  body?: unknown,
  taskConflict = true,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (taskConflict && (response.status === 409 || response.status === 412))
      throw new SaveConflictError();
    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      throw new Error(
        typeof problem?.error === "string"
          ? problem.error
          : response.status === 404
            ? "Сервер не нашёл данные или нужный обработчик. Проверьте подключение API."
            : "Сервер не сохранил изменения. Попробуйте ещё раз.",
      );
    }
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success)
      throw new Error(
        "Сервер вернул некорректный ответ. Ваш текст сохранён в форме; повторите действие.",
      );
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error(
        "Сервер не ответил за 20 секунд. Повторите действие — введённые данные остались в форме.",
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
      ? withLocalLock(() => {
          if (readLocal()[task.id]) throw new SaveConflictError();
          return writeLocal(task);
        })
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
    return withLocalLock(() => {
      const current = currentVersion(task);
      if (
        JSON.stringify(draftInput(current)) === JSON.stringify(draftInput(task))
      )
        return current;
      return writeLocal({
        ...current,
        ...draftInput(task),
        updatedAt: nextUpdatedAt(current),
      });
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
  async confirm(task: Task): Promise<Task> {
    if (dataMode === "api")
      return request(
        `/api/tasks/${encodeURIComponent(task.id)}/confirm`,
        taskSchema,
        "POST",
        { acknowledged: true, expectedRevision: task.revision },
      );
    return withLocalLock(() => {
      const current = currentVersion(task);
      return writeLocal({
        ...confirmTask(current, true),
        updatedAt: nextUpdatedAt(current),
      });
    });
  },
  async publish(task: Task): Promise<Task> {
    if (dataMode === "api")
      return request(
        `/api/tasks/${encodeURIComponent(task.id)}/publish`,
        taskSchema,
        "POST",
        { expectedRevision: task.revision },
      );
    return withLocalLock(() => {
      const current = currentVersion(task);
      return writeLocal({
        ...publishTask(current),
        updatedAt: nextUpdatedAt(current),
      });
    });
  },
};
