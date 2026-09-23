import { describe, expect, it } from "vitest";
import {
  cardResponseSchema,
  emptyContent,
  newTask,
  questionsResponseSchema,
  scoreSchema,
} from "../src/lib/contracts";
import { calculateScore, readiness, validContact } from "../src/lib/scoring";
import {
  confirmTask,
  hasUnconfirmedChanges,
  publishTask,
} from "../src/lib/task-state";
import {
  answersForQuestions,
  fallbackCard,
  fallbackQuestions,
} from "../src/lib/assistance";

describe("business task readiness", () => {
  it("does not award points for empty fields or placeholders", () => {
    const card = emptyContent();
    card.context = "  ";
    card.users = "Не знаю";
    card.need = "потом уточним";
    card.expectedResult = "---";
    expect(calculateScore(card).total).toBe(0);
  });
  it("computes the documented 35 → 80 → 100 demo without awarding title points", () => {
    const card = {
      ...emptyContent(),
      title: "Обработка заказов",
      context: "Заказы переносят вручную",
      need: "Убрать повторный ввод",
      expectedResult: "Веб-прототип приёма заказов",
    };
    expect(calculateScore(card).total).toBe(35);
    Object.assign(card, {
      users: "Администраторы принимают заказы",
      deadline: "7 дней",
      constraints: "Без реальных платежей",
      contact: "demo@example.com",
      interaction: "Два созвона в неделю",
      feedback: "Ответ в течение рабочего дня",
      successMetric: "Доля корректно обработанных заказов",
      successTarget: "18 из 20",
    });
    expect(calculateScore(card).total).toBe(80);
    Object.assign(card, {
      dataDescription: "20 синтетических заказов в CSV",
      dataAccess: "Тестовый CSV передаётся команде",
    });
    expect(calculateScore(card).total).toBe(100);
    expect(scoreSchema.safeParse(calculateScore(card)).success).toBe(true);
  });
  it.each([
    [0, "draft"],
    [39, "draft"],
    [40, "working"],
    [69, "working"],
    [70, "ready"],
    [89, "ready"],
    [90, "priority"],
    [100, "priority"],
  ] as const)("maps boundary %i to %s", (value, expected) =>
    expect(readiness(value)).toBe(expected),
  );
  it("rejects invalid contacts without preventing other progress", () => {
    expect(validContact("это мой контакт")).toBe(false);
    expect(validContact("demo@example.com")).toBe(true);
    expect(validContact("+7 (777) 123-45-67")).toBe(true);
    expect(validContact("@demo_team")).toBe(true);
    expect(
      calculateScore({
        ...emptyContent(),
        contact: "позвоните мне",
        interaction: "Звонок раз в неделю",
        feedback: "Ответ за день",
      }).total,
    ).toBe(5);
  });
});

describe("confirmation and publication", () => {
  it("requires human confirmation and a meaningful title", () => {
    const task = newTask("demo");
    expect(() => confirmTask(task, false)).toThrow();
    expect(() => confirmTask(task, true)).toThrow();
    expect(() => publishTask(task)).toThrow();
  });
  it("allows a confirmed zero-score task to be published", () => {
    const task = newTask("low-score");
    task.draft.title = "Исследовать потребность бизнеса";
    const published = publishTask(confirmTask(task, true));
    expect(published.publishedAt).toBeTruthy();
    expect(published.confirmedScore?.total).toBe(0);
  });
  it("preserves the published snapshot while the business edits", () => {
    const task = newTask("versioned");
    task.draft.title = "Приём заказов";
    const published = publishTask(confirmTask(task, true));
    const changed = {
      ...published,
      draft: { ...published.draft, users: "Администратор пекарни" },
    };
    expect(hasUnconfirmedChanges(changed)).toBe(true);
    expect(changed.confirmedContent?.users).toBe("");
    expect(changed.confirmedScore?.total).toBe(0);
    expect(() => publishTask(changed)).toThrow();
    const confirmed = confirmTask(changed, true);
    expect(confirmed.confirmedScore?.total).toBe(10);
    expect(confirmed.publishedAt).toBe(published.publishedAt);
    expect(hasUnconfirmedChanges(confirmed)).toBe(false);
  });
  it("also requires confirmation after industry changes", () => {
    const task = newTask("industry");
    task.draft.title = "Задача";
    const confirmed = confirmTask(task, true);
    expect(hasUnconfirmedChanges({ ...confirmed, industry: "Логистика" })).toBe(
      true,
    );
  });
});

describe("AI fallback and response validation", () => {
  it("retains answers only for unchanged questions, never reused IDs", () => {
    const task = newTask("regenerate");
    task.questions = [
      { id: "q1", field: "users", text: "Кто пользователь?" },
      { id: "q2", field: "need", text: "Что изменить?" },
      { id: "q3", field: "dataDescription", text: "Какие данные?" },
      { id: "old", field: "feedback", text: "Как отвечаете?" },
    ];
    task.answers = {
      q1: "Администратор",
      q2: "Ускорить обработку",
      q3: "Заказы",
      old: "За день",
    };
    const next = [
      { id: "q1", field: "deadline" as const, text: "К какому сроку?" },
      task.questions[1],
      { ...task.questions[2], text: "Какие учебные материалы?" },
    ];
    const answers = answersForQuestions(task, next);
    expect(answers).toEqual({ q2: "Ускорить обработку" });
    expect(fallbackCard({ ...task, questions: next, answers }).deadline).toBe(
      "",
    );
  });
  it("asks at least three unique, relevant questions", () => {
    const questions = fallbackQuestions(
      "Хотим ускорить обработку заказов",
      emptyContent(),
    );
    expect(questions.length).toBeGreaterThanOrEqual(3);
    expect(questions.some((q) => q.text.includes("заказов"))).toBe(true);
    expect(
      questionsResponseSchema.safeParse({ questions, source: "fallback" })
        .success,
    ).toBe(true);
  });
  it("uses only supplied facts and keeps unknown fields empty", () => {
    const task = newTask("fallback");
    task.rawText = "У нас пекарня";
    task.questions = fallbackQuestions(task.rawText, task.draft);
    task.answers = { users: "Администратор" };
    const card = fallbackCard(task);
    expect(card.context).toBe(task.rawText);
    expect(card.users).toBe("Администратор");
    expect(card.deadline).toBe("");
    expect(card.contact).toBe("");
    expect(card.successTarget).toBe("");
  });
  it("rejects missing/duplicate questions and invalid model output", () => {
    const questions = fallbackQuestions("Задача", emptyContent());
    expect(
      questionsResponseSchema.safeParse({
        source: "ai",
        questions: questions.slice(0, 2),
      }).success,
    ).toBe(false);
    expect(
      questionsResponseSchema.safeParse({
        source: "ai",
        questions: [questions[0], questions[0], questions[0]],
      }).success,
    ).toBe(false);
    expect(
      cardResponseSchema.safeParse({
        source: "ai",
        content: { title: "Неполный ответ" },
      }).success,
    ).toBe(false);
  });
  it("accepts null AI values as visibly unspecified fields", () => {
    const response = cardResponseSchema.parse({
      source: "ai",
      content: { ...emptyContent(), deadline: null },
    });
    expect(response.content.deadline).toBe("");
  });
  it("rejects a score that does not match its breakdown", () => {
    const score = calculateScore(emptyContent());
    expect(
      scoreSchema.safeParse({ ...score, total: 100, level: "priority" })
        .success,
    ).toBe(false);
  });
});
