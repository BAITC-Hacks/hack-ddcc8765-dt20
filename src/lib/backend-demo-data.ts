import { contentSchema, newTask, taskSchema, type Task, type TaskContent } from "./contracts";
import { proposalSchema, teamProfileSchema, type Proposal, type TeamProfile } from "./collaboration-contracts";
import { calculateScore } from "./scoring";
import { confirmTask, publishTask } from "./task-state";

// Fixed IDs make seed reruns safe. This namespace is reserved for synthetic demo fixtures.
const taskId = (n: number) => `d3a01000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const proposalId = (n: number) => `d3a02000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const teamId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const timestamp = "2026-09-20T12:00:00.000Z";

const topics = [
  { title: "Сверка заказов небольшой пекарни", industry: "Торговля", context: "Пекарня вручную переносит заказы из таблицы в журнал смены; в конце дня администратор сверяет позиции.", need: "Нужен инструмент, который показывает расхождения между заказами и журналом до закрытия смены.", users: "Администратор пекарни и сотрудник смены.", dataDescription: "Обезличенные примеры строк заказов и журнала за две тестовые смены.", dataAccess: "Файлы CSV передаются команде через демонстрационную папку.", expectedResult: "Прототип страницы со списком расхождений и экспортом исправлений.", successMetric: "Доля найденных расхождений на тестовом наборе.", successTarget: "Найти не менее 9 из 10 заранее размеченных ошибок.", deadline: "Первый показ через две недели.", constraints: "Использовать только синтетические заказы без данных клиентов.", contact: "bakery-demo@example.com", interaction: "Одна консультация в неделю по видеосвязи.", feedback: "Ответ на вопросы команды в течение двух рабочих дней." },
  { title: "Поиск материалов для учебной библиотеки", industry: "Образование", context: "Наставники хранят методические материалы в нескольких папках и тратят время на поиск версии файла.", need: "Нужен единый поиск по названию, теме и дате обновления материала.", users: "Наставники учебной программы.", dataDescription: "Тестовые описания двадцати учебных файлов и их темы.", dataAccess: "Обезличенный каталог доступен в CSV.", expectedResult: "Прототип каталога с поиском и фильтрами.", successMetric: "Время поиска заданного материала в тестовом каталоге.", successTarget: "Медианное время меньше 30 секунд для пяти сценариев.", deadline: "Демонстрация через три недели.", constraints: "Оригинальные учебные файлы не копировать в прототип.", contact: "learning-demo@example.com", interaction: "Короткая встреча раз в неделю.", feedback: "Наставник комментирует демонстрацию в течение двух дней." },
  { title: "Учет заявок на ремонт оборудования", industry: "Производство", context: "Мастер записывает заявки на ремонт на бумаге, поэтому смены не видят текущий статус.", need: "Нужна общая доска статусов с историей обновлений заявки.", users: "Мастера и начальники смен.", dataDescription: "Синтетические заявки с типом оборудования и датой обращения.", dataAccess: "Таблица примеров выдается команде после встречи.", expectedResult: "Прототип доски заявок с журналом статусов.", successMetric: "Число потерянных переходов статуса в сценариях приемки.", successTarget: "Все десять тестовых переходов отображаются корректно.", deadline: "Пилот через четыре недели.", constraints: "Нет подключения к производственной системе.", contact: "workshop-demo@example.com", interaction: "Созвон с мастером каждый четверг.", feedback: "Замечания записываются в общем документе после показа." },
  { title: "Планирование доставки между складами", industry: "Логистика", context: "Координатор составляет маршрут по таблице отправок и вручную проверяет окна приемки.", need: "Нужна визуальная проверка конфликтов времени для тестовых маршрутов.", users: "Координатор доставки.", dataDescription: "Синтетические адреса, интервалы приемки и длительность поездок.", dataAccess: "Демонстрационный JSON передается команде.", expectedResult: "Прототип расписания с подсветкой конфликтов.", successMetric: "Число выявленных конфликтов на контрольном маршруте.", successTarget: "Показать все шесть размеченных конфликтов.", deadline: "Первый прототип через три недели.", constraints: "Маршруты и адреса полностью вымышлены.", contact: "logistics-demo@example.com", interaction: "Еженедельный разбор сценариев.", feedback: "Координатор присылает комментарии в течение рабочего дня." },
  { title: "Очередь обращений сервисного центра", industry: "Услуги", context: "Заявки из формы переносятся оператором в таблицу, и повторные обращения иногда теряются.", need: "Нужно объединить обращения по тестовому номеру заявки и показать очередь обработки.", users: "Операторы сервисного центра.", dataDescription: "Обезличенные примеры обращений и статусов.", dataAccess: "Команда получает тестовый CSV через демонстрационную папку.", expectedResult: "Прототип очереди с поиском повторных обращений.", successMetric: "Доля правильно сгруппированных обращений на тестовом наборе.", successTarget: "Правильно сгруппировать не менее 18 из 20 примеров.", deadline: "Показ через две недели.", constraints: "Не использовать реальные телефоны или имена клиентов.", contact: "service-demo@example.com", interaction: "Две консультации по видеосвязи.", feedback: "Оператор проверяет прототип по контрольному списку." },
] as const;

const limitedFields: (keyof TaskContent)[][] = [
  ["context", "need"], // draft
  ["context", "need", "dataDescription", "expectedResult", "users"], // working
  ["context", "need", "dataDescription", "dataAccess", "expectedResult", "successMetric", "users"], // ready
  ["context", "need", "dataDescription", "dataAccess", "expectedResult", "successMetric", "successTarget", "deadline", "constraints", "users", "contact"], // priority
  Object.keys(topics[4]).filter((key) => key !== "industry") as (keyof TaskContent)[],
];

function contentFor(index: number, unpublished: boolean): TaskContent {
  const topic = topics[index % topics.length];
  const selected = unpublished ? limitedFields[(index + 2) % limitedFields.length] : limitedFields[index];
  return contentSchema.parse(Object.fromEntries(
    Object.keys(topic).filter((key) => key !== "industry").map((key) => [key, key === "title" || selected.includes(key as keyof TaskContent) ? topic[key as keyof typeof topic] : ""]),
  ));
}

function makeTask(index: number): Task {
  const unpublished = index >= 5;
  const topic = topics[index % topics.length];
  const draft = contentFor(index, unpublished);
  let task: Task = {
    ...newTask(taskId(index + 1)),
    rawText: `${topic.context} ${topic.need}`,
    industry: topic.industry,
    draft,
    step: 3,
    updatedAt: timestamp,
  };
  if (!unpublished) {
    task = publishTask(confirmTask(task, true));
    task = { ...task, confirmedAt: timestamp, publishedAt: timestamp, updatedAt: timestamp };
  }
  return taskSchema.parse(task);
}

export const demoTasks = Array.from({ length: 10 }, (_, index) => makeTask(index));

export const demoTeams: TeamProfile[] = [
  { name: "WebStep", interests: ["Торговля"], skills: ["Интерфейсы", "API"], technologies: ["TypeScript", "React"] },
  { name: "DataLab", interests: ["Образование"], skills: ["Аналитика", "SQL"], technologies: ["Python", "PostgreSQL"] },
  { name: "LogiCode", interests: ["Логистика"], skills: ["Автоматизация"], technologies: ["TypeScript", "Node.js"] },
  { name: "MakerTeam", interests: ["Производство"], skills: ["Прототипирование"], technologies: ["React", "SQL"] },
  { name: "ServiceFlow", interests: ["Услуги"], skills: ["Проектирование", "API"], technologies: ["TypeScript", "Next.js"] },
].map((team, index) => teamProfileSchema.parse({ id: teamId(index + 1), ...team }));

const proposalSpecs = [
  { task: 1, team: 1, status: "accepted", result: "Собран прототип сверки на десяти синтетических заказах.", confirmed: false },
  { task: 1, team: 2, status: "pending", result: null, confirmed: false },
  { task: 2, team: 3, status: "accepted", result: "Подготовлен поиск по тестовому каталогу материалов.", confirmed: true },
  { task: 3, team: 4, status: "rejected", result: null, confirmed: false },
  { task: 4, team: 5, status: "pending", result: null, confirmed: false },
] as const;

export const demoProposals: Proposal[] = proposalSpecs.map((spec, index) => proposalSchema.parse({
  id: proposalId(index + 1),
  taskId: taskId(spec.task),
  teamId: teamId(spec.team),
  idea: `Создать прототип для задачи «${topics[spec.task - 1].title}».`,
  plan: "Согласовать тестовые сценарии, собрать прототип и показать результат заказчику.",
  deadline: "Первый показ через две недели.",
  prototypeUrl: null,
  status: spec.status,
  resultDescription: spec.result,
  resultUrl: null,
  stageConfirmedAt: spec.confirmed ? timestamp : null,
  createdAt: timestamp,
}));

export const demoFixtureSummary = {
  drafts: demoTasks.filter((task) => !task.publishedAt).length,
  published: demoTasks.filter((task) => task.publishedAt).length,
  levels: [...new Set(demoTasks.filter((task) => task.publishedAt).map((task) => calculateScore(task.draft).level))].sort(),
  proposals: demoProposals.length,
  teams: demoTeams.length,
};
