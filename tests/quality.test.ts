import { describe, expect, it } from "vitest";
import { emptyContent } from "../src/lib/contracts";
import { calculateScore, meaningful } from "../src/lib/scoring";
import { calculateReviewedScore, fallbackQualityReview, qualityInputKey } from "../src/lib/quality";
import { qualityDecisionsSchema } from "../src/lib/quality-contracts";

describe("quality-aware fixed scoring", () => {
  it("awards partial points for relevant but incomplete answers", () => {
    const content = { ...emptyContent(), need: "Нужно автоматизировать приём заказов" };
    const review = fallbackQualityReview(content, "Торговля");
    review.source = "ai";
    review.fields = review.fields.map(item => ({ ...item, score: item.field === "need" ? 50 : 0 }));
    expect(calculateReviewedScore(content, review).total).toBe(5);
  });
  it("accepts numeric phones and measurable numeric targets without accepting numeric prose", () => {
    const content = { ...emptyContent(), contact: "77012345678", successMetric: "Количество обработанных заявок за день", successTarget: "20", users: "12345" };
    expect(calculateScore(content).total).toBe(20);
    expect(calculateReviewedScore(content, fallbackQualityReview(content, "Услуги")).total).toBe(20);
    expect(calculateScore({ ...emptyContent(), successTarget: "20" }).total).toBe(0);
  });
  it.each(["без понятия", "БЕЗ ПОНЯТИЯ!", "x", "аааааа", "123456", "не знаю пока", "lorem ipsum", "test test test"])("rejects non-information %s", value => {
    expect(meaningful(value)).toBe(false);
  });
  it("keeps useful concise answers", () => {
    for (const value of ["7 дней", "CSV", "Администратор", "Ограничений нет", "18 из 20"]) expect(meaningful(value)).toBe(true);
  });
  it("cannot award 100 for single character fields", () => {
    const content = Object.fromEntries(Object.keys(emptyContent()).map(key => [key, "x"])) as ReturnType<typeof emptyContent>;
    content.contact = "demo@example.com";
    expect(calculateScore(content).total).toBe(5);
  });
  it("AI rejects an apparently filled but irrelevant field with an explanation", () => {
    const content = { ...emptyContent(), expectedResult: "Заработать миллиард долларов в день" };
    const review = fallbackQualityReview(content, "Торговля");
    review.source = "ai";
    review.fields = review.fields.map(item => item.field === "expectedResult" ? { ...item, accepted: false, reason: "Не описан результат работы команды", suggestion: "Укажите проверяемый прототип" } : item);
    expect(calculateReviewedScore(content, review).total).toBe(0);
    expect(calculateReviewedScore(content, review).groups.find(g => g.id === "result")?.missing[0].label).toContain("проверяемый прототип");
  });
  it("even AI cannot approve empty or junk fields", () => {
    const content = { ...emptyContent(), dataDescription: "без понятия" };
    const review = fallbackQualityReview(content, "Торговля");
    review.fields = review.fields.map(item => ({ ...item, accepted: true }));
    expect(calculateReviewedScore(content, review).total).toBe(0);
  });
  it("detects input changes including industry and canonicalizes property order", () => {
    const content = { ...emptyContent(), users: "Администраторы" };
    const reordered = Object.fromEntries(Object.entries(content).reverse()) as typeof content;
    expect(qualityInputKey(content, "Торговля")).toBe(qualityInputKey(reordered, "Торговля"));
    expect(qualityInputKey(content, "Торговля")).not.toBe(qualityInputKey(content, "Услуги"));
    expect(qualityInputKey(content, "Торговля")).not.toBe(qualityInputKey({ ...content, users: "Поставщики" }, "Торговля"));
  });
  it("rejects duplicate field decisions", () => {
    const review = fallbackQualityReview(emptyContent(), "Другое");
    review.fields[1] = review.fields[0];
    expect(qualityDecisionsSchema.safeParse({ fields: review.fields }).success).toBe(false);
  });
});
