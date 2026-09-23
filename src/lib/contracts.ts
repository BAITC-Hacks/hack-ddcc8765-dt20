import { z } from "zod";

export const FIELD_KEYS = [
  "title",
  "context",
  "need",
  "users",
  "dataDescription",
  "dataAccess",
  "expectedResult",
  "successMetric",
  "successTarget",
  "deadline",
  "constraints",
  "contact",
  "interaction",
  "feedback",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export const contentSchema = z.object({
  title: z.string().max(160),
  context: z.string().max(4000),
  need: z.string().max(4000),
  users: z.string().max(2000),
  dataDescription: z.string().max(4000),
  dataAccess: z.string().max(2000),
  expectedResult: z.string().max(4000),
  successMetric: z.string().max(2000),
  successTarget: z.string().max(2000),
  deadline: z.string().max(1000),
  constraints: z.string().max(2000),
  contact: z.string().max(300),
  interaction: z.string().max(2000),
  feedback: z.string().max(2000),
});
export type TaskContent = z.infer<typeof contentSchema>;
export const emptyContent = (): TaskContent =>
  Object.fromEntries(FIELD_KEYS.map((key) => [key, ""])) as TaskContent;

export const questionSchema = z.object({
  id: z.string().min(1),
  field: z.enum(FIELD_KEYS),
  text: z.string().min(1).max(1000),
  hint: z.string().max(1000).optional(),
});
export type Question = z.infer<typeof questionSchema>;
export const questionsResponseSchema = z
  .object({
    questions: z.array(questionSchema).min(3).max(8),
    source: z.enum(["ai", "fallback"]),
  })
  .refine(
    (value) =>
      new Set(value.questions.map((q) => q.id)).size === value.questions.length,
    "Question IDs must be unique",
  );
export const cardResponseSchema = z.object({
  content: z.preprocess((value) => {
    if (value && typeof value === "object" && !Array.isArray(value))
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          item === null ? "" : item,
        ]),
      );
    return value;
  }, contentSchema),
  source: z.enum(["ai", "fallback"]),
});
export type AssistanceSource = "ai" | "fallback";

export const scoreGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  earned: z.number().min(0),
  max: z.number().positive(),
  missing: z.array(
    z.object({
      field: z.enum(FIELD_KEYS),
      label: z.string(),
      points: z.number().positive(),
    }),
  ),
});
const groupWeights: Record<string, number> = {
  context: 20,
  data: 20,
  result: 15,
  success: 15,
  constraints: 10,
  users: 10,
  contact: 10,
};
export const scoreSchema = z
  .object({
    total: z.number().int().min(0).max(100),
    level: z.enum(["draft", "working", "ready", "priority"]),
    groups: z.array(scoreGroupSchema).length(7),
  })
  .refine((score) => {
    const level =
      score.total < 40
        ? "draft"
        : score.total < 70
          ? "working"
          : score.total < 90
            ? "ready"
            : "priority";
    return (
      score.level === level &&
      new Set(score.groups.map((group) => group.id)).size === 7 &&
      score.groups.every(
        (group) =>
          group.max === groupWeights[group.id] && group.earned <= group.max,
      ) &&
      score.groups.reduce((sum, group) => sum + group.earned, 0) === score.total
    );
  }, "Inconsistent score breakdown");
export type Score = z.infer<typeof scoreSchema>;
export const taskSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().nonnegative().default(0),
  rawText: z.string().max(8000),
  industry: z.string().max(100),
  draft: contentSchema,
  questions: z.array(questionSchema),
  answers: z.record(z.string(), z.string().max(4000)),
  confirmedContent: contentSchema.nullable(),
  confirmedIndustry: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  confirmedScore: scoreSchema.nullable(),
  step: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  source: z.enum(["ai", "fallback"]),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;
export type DraftInput = Pick<
  Task,
  "rawText" | "industry" | "draft" | "questions" | "answers" | "step" | "source"
>;
export function newTask(id: string): Task {
  return {
    id,
    revision: 0,
    rawText: "",
    industry: "Другое",
    draft: emptyContent(),
    questions: [],
    answers: {},
    confirmedContent: null,
    confirmedIndustry: null,
    confirmedAt: null,
    publishedAt: null,
    confirmedScore: null,
    step: 1,
    source: "fallback",
    updatedAt: new Date().toISOString(),
  };
}
export const INDUSTRIES = [
  "Торговля",
  "Образование",
  "Услуги",
  "Производство",
  "Логистика",
  "Другое",
];
export const LEVELS = {
  draft: { label: "Требует уточнения", range: "0–39", short: "Черновик" },
  working: { label: "Рабочая задача", range: "40–69", short: "Рабочая" },
  ready: { label: "Готова к работе", range: "70–89", short: "Готовая" },
  priority: {
    label: "Приоритетная задача",
    range: "90–100",
    short: "Приоритетная",
  },
};
