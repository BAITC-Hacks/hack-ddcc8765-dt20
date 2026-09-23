import type { FieldKey, Score, TaskContent } from "./contracts";

type Rule = {
  field: FieldKey;
  label: string;
  points: number;
  check?: (value: string) => boolean;
};
export const meaningful = (value: string) => {
  const text = value
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/[.!?]+$/, "");
  return (
    /[\p{L}\p{N}]/u.test(text) &&
    ![
      "не знаю",
      "потом",
      "потом уточним",
      "уточним позже",
      "нет",
      "не указано",
      "tbd",
      "n/a",
      "-",
    ].includes(text)
  );
};
export const validContact = (value: string) => {
  const text = value.trim();
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ||
    /^@[a-zA-Z0-9_]{5,}$/.test(text) ||
    /^https?:\/\/\S+\.\S+$/.test(text) ||
    (/^\+?[\d\s()-]{10,22}$/.test(text) && text.replace(/\D/g, "").length >= 10)
  );
};
const groups: { id: string; label: string; rules: Rule[] }[] = [
  {
    id: "context",
    label: "Контекст и потребность",
    rules: [
      {
        field: "context",
        label: "Опишите, как всё работает сейчас",
        points: 10,
      },
      { field: "need", label: "Укажите, что нужно изменить", points: 10 },
    ],
  },
  {
    id: "data",
    label: "Данные и материалы",
    rules: [
      {
        field: "dataDescription",
        label: "Перечислите доступные данные",
        points: 10,
      },
      {
        field: "dataAccess",
        label: "Добавьте источник или способ доступа",
        points: 10,
      },
    ],
  },
  {
    id: "result",
    label: "Ожидаемый результат",
    rules: [
      {
        field: "expectedResult",
        label: "Опишите результат работы команды",
        points: 15,
      },
    ],
  },
  {
    id: "success",
    label: "Критерии успеха",
    rules: [
      {
        field: "successMetric",
        label: "Укажите показатель или проверку",
        points: 10,
      },
      { field: "successTarget", label: "Добавьте условие приёмки", points: 5 },
    ],
  },
  {
    id: "constraints",
    label: "Ограничения",
    rules: [
      { field: "deadline", label: "Укажите срок выполнения", points: 5 },
      {
        field: "constraints",
        label: "Опишите ограничения или их отсутствие",
        points: 5,
      },
    ],
  },
  {
    id: "users",
    label: "Пользователи",
    rules: [
      {
        field: "users",
        label: "Расскажите, кто будет пользоваться решением",
        points: 10,
      },
    ],
  },
  {
    id: "contact",
    label: "Связь с бизнесом",
    rules: [
      {
        field: "contact",
        label: "Добавьте email, телефон или Telegram",
        points: 5,
        check: validContact,
      },
      { field: "interaction", label: "Укажите формат консультаций", points: 3 },
      { field: "feedback", label: "Укажите порядок обратной связи", points: 2 },
    ],
  },
];
export function readiness(total: number): Score["level"] {
  return total < 40
    ? "draft"
    : total < 70
      ? "working"
      : total < 90
        ? "ready"
        : "priority";
}
/** Reference calculation for preview/local demo. API must independently calculate confirmed scores. */
export function calculateScore(content: TaskContent): Score {
  const breakdown = groups.map((group) => {
    const missing = group.rules.filter(
      (rule) =>
        !meaningful(content[rule.field]) ||
        (rule.check && !rule.check(content[rule.field])),
    );
    const max = group.rules.reduce((sum, rule) => sum + rule.points, 0);
    return {
      id: group.id,
      label: group.label,
      max,
      earned: max - missing.reduce((sum, rule) => sum + rule.points, 0),
      missing: missing.map(({ field, label, points }) => ({
        field,
        label,
        points,
      })),
    };
  });
  const total = breakdown.reduce((sum, group) => sum + group.earned, 0);
  return { total, level: readiness(total), groups: breakdown };
}
