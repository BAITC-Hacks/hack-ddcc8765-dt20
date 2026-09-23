import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { FIELD_KEYS } from "../contracts";
import { QUALITY_FIELDS } from "../quality-contracts";
import type { ModelProvider } from "./ai";
import { CARD_PROMPT, QUALITY_PROMPT, QUESTIONS_PROMPT } from "./prompts";

const nullableFields = Object.fromEntries(
  FIELD_KEYS.map((key) => [key, z.string().nullable()]),
) as Record<(typeof FIELD_KEYS)[number], z.ZodNullable<z.ZodString>>;
const card = z.object({
  content: z.object(nullableFields),
  evidence: z.object(nullableFields),
});
const questions = z.object({
  questions: z.array(z.object({
    id: z.string(),
    field: z.enum(FIELD_KEYS),
    text: z.string(),
  })),
});
const quality = z.object({
  fields: z.array(z.object({
    field: z.enum(QUALITY_FIELDS),
    accepted: z.boolean(),
    reason: z.string(),
    suggestion: z.string(),
  })),
});

export function modelProvider(): ModelProvider | undefined {
  if (process.env.AI_MODE === "mock" || !process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)
    return undefined;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 18_000,
    maxRetries: 0,
  });
  const model = process.env.OPENAI_MODEL;

  return async (kind, input) => {
    const schema = kind === "questions"
      ? zodTextFormat(questions, "questions")
      : kind === "card"
        ? zodTextFormat(card, "card")
        : zodTextFormat(quality, "quality");
    const instructions = kind === "questions"
      ? QUESTIONS_PROMPT
      : kind === "card"
        ? CARD_PROMPT
        : QUALITY_PROMPT;
    const response = await client.responses.create({
      model,
      store: false,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: kind === "quality" ? 4000 : 3000,
      text: { format: schema },
    });
    if (response.status !== "completed" || !response.output_text ||
      response.output.some((item) => item.type === "message" &&
        item.content.some((part) => part.type === "refusal")))
      throw new Error("Unusable model response");
    return JSON.parse(response.output_text);
  };
}
