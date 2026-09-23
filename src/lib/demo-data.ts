import { emptyContent, newTask, type TaskContent } from "./contracts";
import { confirmTask, publishTask } from "./task-state";
import { type Proposal, type TeamProfile } from "./collaboration-contracts";

export const DEMO_TEAMS: TeamProfile[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "WebStep",
    interests: ["Торговля"],
    skills: ["Интерфейсы", "API"],
    technologies: ["TypeScript", "React"],
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "DataLab",
    interests: ["Образование"],
    skills: ["Аналитика", "SQL"],
    technologies: ["Python", "PostgreSQL"],
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "LogiCode",
    interests: ["Логистика"],
    skills: ["Автоматизация"],
    technologies: ["TypeScript", "Node.js"],
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "MakerTeam",
    interests: ["Производство"],
    skills: ["Прототипирование"],
    technologies: ["React", "SQL"],
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    name: "ServiceFlow",
    interests: ["Услуги"],
    skills: ["Проектирование", "API"],
    technologies: ["TypeScript", "Next.js"],
  },
];

const cases: {
  industry: string;
  raw: string;
  content: Partial<TaskContent>;
}[] = [
  {
    industry: "Торговля",
    raw: "В пекарне теряются заказы из переписки. Хотим собирать их в одном месте.",
    content: {
      title: "Заказы пекарни в одном окне",
      context:
        "Заказы из переписки вручную переносятся в тетрадь; часть заявок теряется.",
      need: "Собрать заявки в одной форме и видеть статус каждого заказа.",
      dataDescription:
        "20 вымышленных заказов в CSV: позиции, количество, время выдачи.",
      dataAccess: "Демонстрационный CSV передадим команде при первой встрече.",
      expectedResult: "Веб-прототип формы заказа и списка заявок со статусами.",
      successMetric: "Количество заказов, корректно сохранённых при проверке.",
      successTarget: "Не менее 18 из 20 тестовых заказов.",
      deadline: "7 дней",
      constraints: "Прототип работает в браузере; оплата не нужна.",
    },
  },
  {
    industry: "Образование",
    raw: "Учебному центру нужен отчёт по посещаемости. Сейчас преподаватели заполняют разные таблицы.",
    content: {
      title: "Понятный отчёт по посещаемости",
      context:
        "Преподаватели ведут отдельные таблицы, сводный отчёт составляется вручную.",
      need: "Автоматически объединять таблицы по учебным группам.",
      users: "Методист проверяет посещаемость и планирует консультации.",
      dataDescription: "Обезличенная таблица на 100 учебных посещений.",
      dataAccess:
        "CSV предоставляется через координатора после выбора команды.",
      expectedResult: "Отчёт с фильтрами по группам и датам.",
      successMetric: "Совпадение итогов с контрольной сводной таблицей.",
      successTarget: "Все 100 строк учтены без дублей.",
      deadline: "10 дней",
      constraints: "Только синтетические данные; без подключения к журналу.",
      contact: "education@example.com",
      interaction: "Два созвона в неделю по 20 минут.",
      feedback: "Методист отвечает на вопросы в течение рабочего дня.",
    },
  },
  {
    industry: "Логистика",
    raw: "Нужен простой экран для учёта задержек доставки. Есть тестовая таблица отправлений.",
    content: {
      title: "Где задерживаются доставки",
      context: "Диспетчер сверяет сроки доставки вручную в таблице.",
      need: "Выделять задержанные отправления.",
      dataDescription:
        "50 синтетических отправлений с плановой и фактической датой.",
      dataAccess: "Файл CSV передаст координатор.",
      users: "Диспетчер службы доставки ищет просроченные заказы.",
    },
  },
  {
    industry: "Производство",
    raw: "Мастерской нужен понятный учёт остатков материалов. Пока всё записываем на бумаге.",
    content: {
      title: "Остатки материалов мастерской",
      context:
        "Расход материалов записывают на бумаге, остатки сверяют вручную.",
      need: "Видеть наличие материалов перед началом заказа.",
      expectedResult: "Прототип экрана остатков и списания материалов.",
    },
  },
  {
    industry: "Услуги",
    raw: "Хотим организовать очередь заявок в сервисной мастерской, чтобы ничего не забывать.",
    content: {
      title: "Очередь заявок на ремонт",
      context: "Заявки на ремонт приходят в разные чаты.",
      need: "Собирать обращения в единый список.",
    },
  },
];

/** Synthetic, explicitly confirmed examples; scores always come from the real rules. */
export function demoDataset() {
  const timestamp = "2026-09-23T08:00:00.000Z";
  const published = cases.map((item, i) => {
    const task = {
      ...newTask(`10000000-0000-4000-8000-00000000000${i + 1}`),
      industry: item.industry,
      rawText: item.raw,
      draft: { ...emptyContent(), ...item.content },
      step: 3 as const,
    };
    return {
      ...publishTask(confirmTask(task, true)),
      confirmedAt: timestamp,
      publishedAt: timestamp,
      updatedAt: timestamp,
    };
  });
  const drafts = cases.map((item, i) => ({
    ...newTask(`20000000-0000-4000-8000-00000000000${i + 1}`),
    industry: item.industry,
    rawText: item.raw,
    draft: {
      ...emptyContent(),
      ...Object.fromEntries(Object.entries(item.content).slice(0, i + 1)),
    },
    updatedAt: timestamp,
  }));
  const targets = [0, 0, 1, 2, 4];
  const ideas = [
    "Форма заказа и доска статусов",
    "Таблица заказов с проверкой заполнения",
    "Сводный отчёт по посещаемости",
    "Панель задержек доставки",
    "Список обращений со статусами ремонта",
  ];
  const proposals: Proposal[] = DEMO_TEAMS.map((team, i) => ({
    id: `30000000-0000-4000-8000-00000000000${i + 1}`,
    taskId: published[targets[i]].id,
    teamId: team.id,
    idea: ideas[i],
    plan: "Уточнить задачу на встрече, изучить тестовые данные, собрать прототип и проверить на согласованных примерах.",
    deadline: `${7 + i} дней`,
    prototypeUrl: `https://example.com/demo/prototype-${i + 1}`,
    status: i === 0 ? "accepted" : "pending",
    resultDescription:
      i === 0
        ? "Демонстрационный этап: собраны форма заказа и список статусов, проверены 20 синтетических заявок."
        : null,
    resultUrl: i === 0 ? "https://example.com/demo/bakery-result" : null,
    stageConfirmedAt: null,
    createdAt: timestamp,
  }));
  return { tasks: [...published, ...drafts], teams: DEMO_TEAMS, proposals };
}

export {
  demoTasks,
  demoTeams,
  demoProposals,
  demoFixtureSummary,
} from "./backend-demo-data";
