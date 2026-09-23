import { FIELD_KEYS, type TaskContent, type Score } from "./contracts";
import { calculateScore } from "./scoring";
import { QUALITY_FIELDS, type QualityReview } from "./quality-contracts";

/** Exact canonical identity avoids stale reviews and hash collisions. Never log it. */
export function qualityInputKey(content: TaskContent, industry: string): string {
  return JSON.stringify(["quality-v1", industry, ...FIELD_KEYS.map(key => content[key])]);
}

export function fallbackQualityReview(content: TaskContent, industry: string): QualityReview {
  const score = calculateScore(content);
  const missing = new Map(score.groups.flatMap(group => group.missing).map(item => [item.field, item.label]));
  const normalized = QUALITY_FIELDS.map(field => content[field].trim().toLocaleLowerCase("ru"));
  return {
    source: "fallback", version: "quality-v1",
    inputKey: qualityInputKey(content, industry), checkedAt: new Date().toISOString(),
    fields: QUALITY_FIELDS.map((field, index) => {
      const repeated = normalized[index].length > 0 && normalized.filter(value => value === normalized[index]).length >= 3;
      const accepted = !missing.has(field) && !repeated;
      return {
        field, accepted,
        reason: accepted ? "Поле прошло базовую проверку; смысловая AI-проверка не выполнена."
          : repeated ? "Одинаковый ответ повторён в разных полях."
          : content[field].trim() ? "Ответ не содержит достаточных сведений или имеет неверный формат." : "Сведения не указаны.",
        suggestion: accepted ? "" : missing.get(field) ?? "Опишите сведения, относящиеся именно к этому полю.",
      };
    }),
  };
}

/** The model only vetoes field eligibility. All weights and arithmetic stay in code. */
export function calculateReviewedScore(content: TaskContent, review: QualityReview): Score {
  const decisions = new Map(review.fields.map(item => [item.field, item]));
  const basic = new Map(fallbackQualityReview(content, "").fields.map(item => [item.field, item.accepted]));
  const eligible = { ...content };
  for (const field of QUALITY_FIELDS) if (!basic.get(field) || !decisions.get(field)?.accepted) eligible[field] = "";
  const score = calculateScore(eligible);
  return {
    ...score,
    groups: score.groups.map(group => ({
      ...group,
      missing: group.missing.map(item => {
        const decision = decisions.get(item.field as typeof QUALITY_FIELDS[number]);
        return decision && !decision.accepted
          ? { ...item, label: decision.suggestion || decision.reason }
          : item;
      }),
    })),
  };
}
