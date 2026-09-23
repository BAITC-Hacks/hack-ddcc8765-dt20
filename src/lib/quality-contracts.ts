import { z } from "zod";

export const QUALITY_FIELDS = [
  "context", "need", "users", "dataDescription", "dataAccess",
  "expectedResult", "successMetric", "successTarget", "deadline",
  "constraints", "contact", "interaction", "feedback",
] as const;
export const qualityDecisionSchema = z.object({
  field: z.enum(QUALITY_FIELDS),
  accepted: z.boolean(),
  reason: z.string().trim().min(1).max(500),
  suggestion: z.string().trim().max(500),
}).strict();
export const qualityDecisionsSchema = z.object({
  fields: z.array(qualityDecisionSchema).length(QUALITY_FIELDS.length),
}).strict().refine(value => new Set(value.fields.map(item => item.field)).size === QUALITY_FIELDS.length, "Every quality field must occur exactly once");
export const qualityReviewSchema = qualityDecisionsSchema.safeExtend({
  source: z.enum(["ai", "fallback"]),
  version: z.literal("quality-v1"),
  inputKey: z.string().max(200000),
  checkedAt: z.iso.datetime(),
});
export type QualityDecision = z.infer<typeof qualityDecisionSchema>;
export type QualityReview = z.infer<typeof qualityReviewSchema>;
