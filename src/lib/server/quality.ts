import { type TaskContent } from "../contracts";
import { fallbackQualityReview, qualityInputKey } from "../quality";
import { qualityDecisionsSchema, qualityReviewSchema, type QualityReview } from "../quality-contracts";
import { tryModel, type ModelProvider } from "./ai";

export async function reviewQuality(
  content: TaskContent,
  industry: string,
  provider?: ModelProvider,
): Promise<QualityReview> {
  const inputKey = qualityInputKey(content, industry);
  const reviewed = await tryModel(
    "quality",
    { content, industry },
    provider,
    (value) => qualityDecisionsSchema.parse(value),
  );
  if (!reviewed) return fallbackQualityReview(content, industry);
  return qualityReviewSchema.parse({
    ...reviewed,
    source: "ai",
    version: "quality-v1",
    inputKey,
    checkedAt: new Date().toISOString(),
  });
}
