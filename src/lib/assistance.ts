import {
  emptyContent,
  type TaskContent,
  type Task,
  type Question,
} from "./contracts";
import { meaningful } from "./scoring";

export function answersForQuestions(
  task: Pick<Task, "questions" | "answers">,
  questions: Question[],
): Task["answers"] {
  return Object.fromEntries(
    questions
      .filter(
        (q) =>
          task.questions.some(
            (old) =>
              old.id === q.id &&
              old.field === q.field &&
              old.text === q.text &&
              old.hint === q.hint,
          ) && Object.hasOwn(task.answers, q.id),
      )
      .map((q) => [q.id, task.answers[q.id]]),
  );
}

/** Deliberately deterministic fallback. Never presented as a model response. */
export function fallbackQuestions(
  rawText: string,
  content: TaskContent,
): Question[] {
  const ordering: Question[] = [
    {
      id: "users",
      field: "users",
      text: "Кто будет пользоваться решением и какую задачу он выполняет?",
      hint: "Например: администратор принимает и проверяет заказы.",
    },
    {
      id: "data",
      field: "dataDescription",
      text: /заказ|продаж|магазин|пекар/i.test(rawText)
        ? "Какие примеры заказов или продаж вы можете предоставить команде?"
        : /обуч|студент|школ|курс/i.test(rawText)
          ? "Какие учебные материалы или обезличенные примеры обращений доступны команде?"
          : "Какие данные, документы или примеры доступны для работы?",
      hint: "Опишите только реально доступные материалы. Если их нет, так и напишите.",
    },
    {
      id: "result",
      field: "expectedResult",
      text: "Что именно команда должна передать вам в конце работы?",
      hint: "Прототип, отчёт, инструмент — и что он должен делать.",
    },
    {
      id: "metric",
      field: "successMetric",
      text: "Как вы проверите, что решение действительно помогает?",
      hint: "Назовите измеримый показатель или конкретную проверку.",
    },
    {
      id: "need",
      field: "need",
      text: "Что нужно изменить в текущем процессе?",
      hint: "Назовите проблему, которую команда должна решить.",
    },
    {
      id: "deadline",
      field: "deadline",
      text: "К какому сроку нужен первый результат?",
      hint: "Укажите дату или доступное количество дней.",
    },
    {
      id: "access",
      field: "dataAccess",
      text: "Как команда получит доступ к данным и примерам?",
    },
    {
      id: "feedback",
      field: "feedback",
      text: "Как быстро вы сможете давать обратную связь команде?",
    },
  ];
  const missing = ordering.filter((q) => !meaningful(content[q.field]));
  return [
    ...missing,
    ...ordering.filter((q) => meaningful(content[q.field])),
  ].slice(0, 5);
}
export function fallbackCard(
  task: Pick<Task, "rawText" | "draft" | "questions" | "answers">,
): TaskContent {
  const content = { ...emptyContent(), ...task.draft };
  // Preserve the original description verbatim; do not infer facts or targets.
  if (!content.context) content.context = task.rawText.slice(0, 4000);
  for (const question of task.questions) {
    const answer = task.answers[question.id]?.trim();
    if (answer)
      content[question.field] = answer.slice(
        0,
        question.field === "title"
          ? 160
          : question.field === "contact"
            ? 300
            : question.field === "deadline"
              ? 1000
              : [
                    "context",
                    "need",
                    "dataDescription",
                    "expectedResult",
                  ].includes(question.field)
                ? 4000
                : 2000,
      );
  }
  return content;
}
