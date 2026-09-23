import { emptyContent, newTask, type Task, type TaskContent } from "./contracts";
import { calculateScore } from "./scoring";
import type { Proposal, Team } from "./collaboration-contracts";

const taskId = (number: number) =>
  `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const proposalId = (number: number) =>
  `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const teamId = (number: number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

function exampleTask(
  number: number,
  industry: string,
  content: Partial<TaskContent>,
  publishedAt?: string,
): Task {
  const draft = { ...emptyContent(), ...content };
  const task = {
    ...newTask(taskId(number)),
    industry,
    draft,
    step: 3 as const,
    updatedAt: publishedAt ?? "2026-09-22T09:00:00.000Z",
  };
  return publishedAt
    ? {
        ...task,
        confirmedContent: { ...draft },
        confirmedIndustry: industry,
        confirmedScore: calculateScore(draft),
        confirmedAt: publishedAt,
        publishedAt,
      }
    : task;
}

/** Ten separate synthetic tasks: five published and five unconfirmed drafts. */
export function demoTasks(): Task[] {
  return [
    exampleTask(1, "Торговля", {
      title: "Ускорить обработку заказов пекарни",
      context: "Администратор вручную переносит обращения в таблицу.",
      need: "Убрать повторный ввод заказов.",
      users: "Два администратора, которые принимают и проверяют заказы.",
      dataDescription: "Синтетический CSV заказов с описанием колонок.",
      dataAccess: "Тестовый файл передаётся через контакт пекарни.",
      expectedResult: "Веб-прототип со структурированной записью заказа.",
      successMetric: "Корректность и время обработки 20 тестовых заказов.",
      successTarget: "Не менее 18 из 20 заказов; каждый менее чем за минуту.",
      deadline: "Первый прототип через неделю.",
      constraints: "Без подключения к реальным платежам.",
      contact: "bakery-demo@example.com",
      interaction: "Консультации дважды в неделю.",
      feedback: "Ответ на вопросы в течение рабочего дня.",
    }, "2026-09-23T08:00:00.000Z"),
    exampleTask(2, "Образование", {
      title: "Учёт обращений в учебный центр",
      context: "Заявки приходят в несколько каналов и теряются.",
      need: "Собрать обращения в единый список.",
      users: "Администраторы учебного центра.",
      expectedResult: "Прототип журнала обращений с поиском.",
      successMetric: "Доля обращений, внесённых в журнал.",
      successTarget: "Все 20 тестовых обращений видны в журнале.",
      deadline: "10 дней.",
      constraints: "Только синтетические обращения.",
      contact: "school-demo@example.com",
      interaction: "Один созвон в неделю.",
      feedback: "Проверка прототипа на следующий рабочий день.",
    }, "2026-09-23T07:00:00.000Z"),
    exampleTask(3, "Торговля", {
      title: "Показывать остатки небольшого магазина",
      context: "Остатки записываются вручную в разных таблицах.",
      need: "Свести остатки в один экран.",
      users: "Продавец и управляющий магазином.",
      expectedResult: "Прототип страницы с остатками товаров.",
    }, "2026-09-23T06:00:00.000Z"),
    exampleTask(4, "Логистика", {
      title: "Разобраться с заявками на доставку",
    }, "2026-09-23T05:00:00.000Z"),
    exampleTask(5, "Производство", {
      title: "Отчётность небольшой мастерской",
      context: "Итоги смены фиксируются на бумаге.",
      need: "Собирать итоги в цифровом виде.",
      dataDescription: "Синтетические записи за 10 смен.",
      dataAccess: "CSV можно получить у демонстрационного контакта.",
      expectedResult: "Прототип отчёта по сменам.",
      successMetric: "Время подготовки отчёта.",
      deadline: "Две недели.",
    }, "2026-09-23T04:00:00.000Z"),
    exampleTask(6, "Услуги", { title: "Улучшить запись на консультации" }),
    exampleTask(7, "Логистика", { title: "Уточнить маршрут курьера" }),
    exampleTask(8, "Образование", { title: "Подготовить список занятий" }),
    exampleTask(9, "Торговля", { title: "Сверить ассортимент магазина" }),
    exampleTask(10, "Производство", { title: "Описать загрузку мастерской" }),
  ];
}

export const demoTeams: Omit<Team, "xp">[] = [
  { id: teamId(1), name: "WebStep", interests: ["Торговля"], skills: ["Интерфейсы", "API"], technologies: ["TypeScript", "React"] },
  { id: teamId(2), name: "DataLab", interests: ["Образование"], skills: ["Аналитика", "SQL"], technologies: ["Python", "PostgreSQL"] },
  { id: teamId(3), name: "LogiCode", interests: ["Логистика"], skills: ["Автоматизация"], technologies: ["TypeScript", "Node.js"] },
  { id: teamId(4), name: "MakerTeam", interests: ["Производство"], skills: ["Прототипирование"], technologies: ["React", "SQL"] },
  { id: teamId(5), name: "ServiceFlow", interests: ["Услуги"], skills: ["Проектирование", "API"], technologies: ["TypeScript", "Next.js"] },
];

function exampleProposal(
  number: number,
  taskNumber: number,
  teamNumber: number,
  idea: string,
  plan: string,
  status: Proposal["status"] = "pending",
): Proposal {
  return {
    id: proposalId(number),
    taskId: taskId(taskNumber),
    teamId: teamId(teamNumber),
    idea,
    plan,
    deadline: "7 дней",
    prototypeUrl: null,
    status,
    resultDescription: number === 1 ? "Прототип формы приёма заказов готов. 19 из 20 синтетических заказов обработаны корректно." : null,
    resultUrl: null,
    stageConfirmedAt: null,
    createdAt: `2026-09-23T0${number}:30:00.000Z`,
  };
}

export const demoProposals: Proposal[] = [
  exampleProposal(1, 1, 1, "Веб-форма приёма заказов", "Изучить CSV, собрать форму и проверить 20 примеров.", "accepted"),
  exampleProposal(2, 1, 4, "Панель для администратора", "Согласовать поля заказа, создать панель и проверить ввод."),
  exampleProposal(3, 2, 2, "Журнал обращений", "Описать категории, собрать журнал и проверить поиск."),
  exampleProposal(4, 3, 5, "Экран остатков", "Подготовить макет, импортировать синтетические остатки."),
  exampleProposal(5, 4, 3, "Карта заявок", "Уточнить данные и собрать небольшой прототип."),
];

export const DEMO_TASK_IDS = new Set(demoTasks().map((task) => task.id));
