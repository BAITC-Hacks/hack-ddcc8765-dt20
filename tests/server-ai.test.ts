import { describe, expect, it } from "vitest";
import { emptyContent } from "../src/lib/contracts";
import { fallbackQuestions } from "../src/lib/assistance";
import { assistCard, assistQuestions } from "../src/lib/server/ai";

const input = {
  rawText: "Мы принимаем заказы вручную",
  industry: "Торговля",
  content: emptyContent(),
};
describe("server AI validation and fallback", () => {
  it("returns explicit fallback without a configured model", async () => {
    const response = await assistQuestions(input);
    expect(response.source).toBe("fallback");
    expect(response.questions.length).toBeGreaterThanOrEqual(3);
  });
  it("retries one invalid response then accepts valid questions", async () => {
    let attempts = 0;
    const response = await assistQuestions(input, async () =>
      ++attempts === 1
        ? { questions: [] }
        : { questions: fallbackQuestions(input.rawText, input.content) },
    );
    expect(response.source).toBe("ai");
    expect(response.questions.length).toBeGreaterThanOrEqual(3);
  });
  it("stops after two failures and preserves supplied answers", async () => {
    let attempts = 0;
    const response = await assistCard(
      {
        ...input,
        questions: fallbackQuestions(input.rawText, input.content),
        answers: { users: "Администратор" },
      },
      async () => {
        attempts++;
        throw new Error("provider unavailable");
      },
    );
    expect(attempts).toBe(2);
    expect(response.source).toBe("fallback");
    expect(response.content.users).toBe("Администратор");
    expect(response.content.deadline).toBe("");
  });
  it("rejects invented evidence and falls back to original input", async () => {
    const response = await assistCard(
      { ...input, questions: [], answers: {} },
      async () => ({
        content: { ...emptyContent(), deadline: "Завтра" },
        evidence: { deadline: "Заказчик сказал: завтра" },
      }),
    );
    expect(response.source).toBe("fallback");
    expect(response.content.deadline).toBe("");
  });
  it("accepts grounded output with null unknown values", async () => {
    const response = await assistCard(
      { ...input, questions: [], answers: {} },
      async () => ({
        content: { ...emptyContent(), context: input.rawText, deadline: null },
        evidence: { context: input.rawText },
      }),
    );
    expect(response.source).toBe("ai");
    expect(response.content.context).toBe(input.rawText);
    expect(response.content.deadline).toBe("");
  });
});
