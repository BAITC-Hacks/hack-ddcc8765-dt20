import type { FieldKey } from "./contracts";
export type Field = {
  key: FieldKey;
  label: string;
  hint: string;
  placeholder: string;
  short?: boolean;
};
export const FIELD_SECTIONS: {
  id: string;
  title: string;
  description: string;
  fields: Field[];
}[] = [
  {
    id: "essence",
    title: "Суть задачи",
    description: "Помогите команде понять вашу ситуацию.",
    fields: [
      {
        key: "title",
        label: "Название задачи",
        hint: "Коротко: что нужно сделать. Обязательно для подтверждения.",
        placeholder: "Например: упростить приём заказов в пекарне",
        short: true,
      },
      {
        key: "context",
        label: "Как всё работает сейчас",
        hint: "Текущий процесс, проблема и её влияние на бизнес.",
        placeholder: "Опишите текущую ситуацию…",
      },
      {
        key: "need",
        label: "Что нужно изменить",
        hint: "Какую потребность должно закрыть решение?",
        placeholder: "Расскажите, что хотите улучшить…",
      },
      {
        key: "users",
        label: "Пользователи",
        hint: "Кто будет пользоваться результатом и для чего?",
        placeholder: "Роль пользователя и его задача…",
      },
    ],
  },
  {
    id: "resources",
    title: "Данные и условия",
    description: "Что вы предоставите команде и какие есть границы.",
    fields: [
      {
        key: "dataDescription",
        label: "Доступные данные и материалы",
        hint: "Форматы, объём, примеры. Не добавляйте персональные данные.",
        placeholder: "Например: обезличенная таблица с примерами заказов…",
      },
      {
        key: "dataAccess",
        label: "Источник и доступ",
        hint: "Ссылка, пример или способ передачи материалов.",
        placeholder: "Где команда получит данные…",
      },
      {
        key: "deadline",
        label: "Сроки",
        hint: "Дата или время, которое есть на работу.",
        placeholder: "Например: первый прототип через 7 дней",
        short: true,
      },
      {
        key: "constraints",
        label: "Ограничения",
        hint: "Технологии, бюджет, доступы. Если ограничений нет, укажите это явно.",
        placeholder: "Что необходимо учесть…",
      },
    ],
  },
  {
    id: "outcome",
    title: "Результат и успех",
    description: "Сформулируйте, что вы будете принимать у команды.",
    fields: [
      {
        key: "expectedResult",
        label: "Ожидаемый результат",
        hint: "Конкретный продукт, прототип, отчёт или другой итог.",
        placeholder: "Что команда должна передать вам…",
      },
      {
        key: "successMetric",
        label: "Показатель или проверка",
        hint: "Как измерить полезность результата?",
        placeholder: "Например: доля корректно обработанных тестовых заказов…",
      },
      {
        key: "successTarget",
        label: "Условие приёмки",
        hint: "Целевое значение или проверяемое условие.",
        placeholder: "Например: не менее 18 из 20 тестовых заказов…",
      },
    ],
  },
  {
    id: "connection",
    title: "Связь с вами",
    description: "Покажите, как бизнес будет помогать команде.",
    fields: [
      {
        key: "contact",
        label: "Контакт",
        hint: "Email, телефон, @username или ссылка для связи.",
        placeholder: "name@company.kz",
        short: true,
      },
      {
        key: "interaction",
        label: "Формат консультаций",
        hint: "Созвоны, встречи или переписка и их частота.",
        placeholder: "Как вы будете общаться с командой…",
      },
      {
        key: "feedback",
        label: "Обратная связь",
        hint: "Кто проверяет результат и когда отвечает на вопросы?",
        placeholder: "Порядок и срок ответа…",
      },
    ],
  },
];
export const FIELD_LIMITS: Record<FieldKey, number> = {
  title: 160,
  context: 4000,
  need: 4000,
  users: 2000,
  dataDescription: 4000,
  dataAccess: 2000,
  expectedResult: 4000,
  successMetric: 2000,
  successTarget: 2000,
  deadline: 1000,
  constraints: 2000,
  contact: 300,
  interaction: 2000,
  feedback: 2000,
};
