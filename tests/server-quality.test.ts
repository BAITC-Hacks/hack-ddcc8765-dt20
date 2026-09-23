import { describe, expect, it } from "vitest";
import { emptyContent } from "../src/lib/contracts";
import { QUALITY_FIELDS } from "../src/lib/quality-contracts";
import { reviewQuality } from "../src/lib/server/quality";

const content = { ...emptyContent(), need: "Заказы теряются при ручном вводе" };
const decisions = () => ({
  fields: QUALITY_FIELDS.map((field) => ({
    field,
    accepted: field === "need",
    reason: "Проверено по смыслу поля",
    suggestion: field === "need" ? "" : "Уточните конкретику",
  })),
});

describe("AI quality review", () => {
  it("returns a validated review with all thirteen fields", async () => {
    const result = await reviewQuality(content, "Торговля", async (kind) => {
      expect(kind).toBe("quality");
      return decisions();
    });
    expect(result.source).toBe("ai");
    expect(result.version).toBe("quality-v1");
    expect(result.fields).toHaveLength(13);
    expect(result.fields.find((item) => item.field === "need")?.accepted).toBe(true);
    expect(result.inputKey).toContain("Торговля");
    expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
  });

  it.each(["missing", "duplicate", "invalid"])(
    "falls back after %s quality decisions twice",
    async (failure) => {
      let attempts = 0;
      const result = await reviewQuality(content, "Торговля", async () => {
        attempts++;
        const value = decisions();
        if (failure === "missing") value.fields.pop();
        if (failure === "duplicate") value.fields[1].field = value.fields[0].field;
        if (failure === "invalid") value.fields[0].accepted = "yes" as never;
        return value;
      });
      expect(attempts).toBe(2);
      expect(result.source).toBe("fallback");
      expect(result.fields).toHaveLength(13);
      expect(result.inputKey).toContain("Торговля");
    },
  );

  it("returns an explicit fallback after provider errors", async () => {
    let attempts = 0;
    const result = await reviewQuality(content, "Торговля", async () => {
      attempts++;
      throw new Error("never log this secret text");
    });
    expect(attempts).toBe(2);
    expect(result.source).toBe("fallback");
  });

  it("rejects a model attempt to attach its own numeric score", async () => {
    const result = await reviewQuality(content, "Торговля", async () => ({
      ...decisions(),
      score: 100,
    }));
    expect(result.source).toBe("fallback");
    expect("score" in result).toBe(false);
  });

  it("returns an explicit fallback without a provider", async () => {
    const result = await reviewQuality(content, "Торговля");
    expect(result.source).toBe("fallback");
    expect(result.fields).toHaveLength(13);
  });
});
