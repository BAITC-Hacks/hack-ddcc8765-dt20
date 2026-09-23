import { FIELD_KEYS, type TaskContent, type Score } from "./contracts";
import { calculateScore, groups, readiness } from "./scoring";
import { QUALITY_FIELDS, type QualityReview } from "./quality-contracts";

/** Exact canonical identity avoids stale reviews and hash collisions. Never log it. */
export function qualityInputKey(content: TaskContent, industry: string): string {
  return JSON.stringify(["quality-v2", industry, ...FIELD_KEYS.map(key => content[key])]);
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

/** AI grades each field; fixed weights and final arithmetic stay in code. */
export function calculateReviewedScore(content: TaskContent, review: QualityReview): Score {
  const decisions = new Map(review.fields.map(item => [item.field, item]));
  const basic = new Map(fallbackQualityReview(content, "").fields.map(item => [item.field, item.accepted]));
  const breakdown = groups.map(group => {
    let earned = 0;
    const missing: Score["groups"][number]["missing"] = [];
    for (const rule of group.rules) {
      const field = rule.field as typeof QUALITY_FIELDS[number];
      const decision = decisions.get(field);
      const percent = basic.get(field) && decision?.accepted ? (decision.score ?? 100) : 0;
      const points = Math.floor(rule.points * percent / 100);
      earned += points;
      if (points < rule.points) missing.push({ field, points: rule.points - points,
        label: decision?.suggestion || decision?.reason || rule.label });
    }
    return { id: group.id, label: group.label, max: group.rules.reduce((sum, rule) => sum + rule.points, 0), earned, missing };
  });
  const total = breakdown.reduce((sum, group) => sum + group.earned, 0);
  return { total, level: readiness(total), groups: breakdown };
}
