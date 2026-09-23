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
import { aiDiagnostic, providerCategory, type AiKind } from "./ai-diagnostics";

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
  kind: AiKind,
  input: unknown,
) => Promise<unknown>;

const ATTEMPT_TIMEOUT_MS = 18_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(), { name: "TimeoutError" })), ATTEMPT_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function tryModel<T>(
  kind: AiKind,
  input: unknown,
  provider: ModelProvider | undefined,
  validate: (value: unknown) => T,
): Promise<T | null> {
  if (!provider) {
    aiDiagnostic("ai_fallback", kind, "configuration", "fallback", 0);
    return null;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    let result: unknown;
    try {
      result = await withTimeout(Promise.resolve().then(() => provider(kind, input)));
    } catch (error) {
      const category = providerCategory(error);
      aiDiagnostic("ai_attempt", kind, category, "failure", Date.now() - started);
      if (attempt === 1) aiDiagnostic("ai_fallback", kind, category, "fallback", Date.now() - started);
      continue;
    }
    try {
      return validate(result);
    } catch {
      aiDiagnostic("ai_attempt", kind, "schema", "failure", Date.now() - started);
      if (attempt === 1) aiDiagnostic("ai_fallback", kind, "schema", "fallback", Date.now() - started);
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
    const texts = parsed.questions.map(q => q.text.normalize("NFKC").toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}]+/gu, ""));
    if (parsed.questions.some(q => q.field === "title") ||
      new Set(parsed.questions.map(q => q.field)).size !== parsed.questions.length ||
      new Set(texts).size !== texts.length)
      throw new Error("Questions must cover distinct substantive gaps");
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
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    for (const key of FIELD_KEYS) {
      if (!parsed.content[key].trim()) continue;
      const quote = raw.evidence[key]?.trim();
      if (
        !quote ||
        !normalize(quote).includes(normalize(parsed.content[key])) ||
        !sources.some((source) => normalize(source).includes(normalize(quote)))
      )
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
