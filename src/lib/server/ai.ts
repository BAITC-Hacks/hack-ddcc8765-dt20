import { z } from "zod";
import {
  FIELD_KEYS,
  contentSchema,
  questionSchema,
  questionsResponseSchema,
  cardResponseSchema,
  taskSchema,
} from "../contracts";
import { fallbackCard, fallbackQuestions } from "../assistance";

export const questionsInput = z
  .object({
    rawText: z.string().trim().min(1).max(8000),
    industry: z.string().max(100),
    content: contentSchema,
  })
  .strict();
export const cardInput = questionsInput.extend({
  questions: z.array(questionSchema).max(8),
  answers: taskSchema.shape.answers,
});
export type ModelProvider = (
  kind: "questions" | "card",
  input: unknown,
) => Promise<unknown>;

async function tryModel<T>(
  kind: "questions" | "card",
  input: unknown,
  provider: ModelProvider | undefined,
  validate: (value: unknown) => T,
): Promise<T | null> {
  if (!provider) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return validate(await provider(kind, input));
    } catch {
      /* Never expose provider messages, secrets or raw prompts. */
    }
  }
  return null;
}

export async function assistQuestions(
  input: z.infer<typeof questionsInput>,
  provider?: ModelProvider,
) {
  const result = await tryModel("questions", input, provider, (value) => {
    const parsed = z
      .object({ questions: z.array(questionSchema).min(3).max(5) })
      .parse(value);
    return questionsResponseSchema.parse({ ...parsed, source: "ai" });
  });
  return (
    result ?? {
      questions: fallbackQuestions(input.rawText, input.content),
      source: "fallback" as const,
    }
  );
}

export async function assistCard(
  input: z.infer<typeof cardInput>,
  provider?: ModelProvider,
) {
  const result = await tryModel("card", input, provider, (value) => {
    const raw = z
      .object({
        content: z.unknown(),
        evidence: z.record(z.string(), z.string().nullable()),
      })
      .parse(value);
    const parsed = cardResponseSchema.parse({
      content: raw.content,
      source: "ai",
    });
    const sources = [
      input.rawText,
      ...Object.values(input.content),
      ...Object.values(input.answers),
    ];
    for (const key of FIELD_KEYS) {
      if (!parsed.content[key].trim()) continue;
      const quote = raw.evidence[key]?.trim();
      if (!quote || !sources.some((source) => source.includes(quote)))
        throw new Error("Unsupported evidence");
    }
    return { ...parsed, evidence: raw.evidence };
  });
  return (
    result ?? {
      content: fallbackCard({
        rawText: input.rawText,
        draft: input.content,
        questions: input.questions,
        answers: input.answers,
      }),
      source: "fallback" as const,
    }
  );
}
