import { z } from "zod";
import { contentSchema, scoreSchema } from "./contracts";
import type { CatalogFilters, PublishedTask } from "./catalog";
import { proposalSchema, teamSchema } from "./collaboration-contracts";

export const publishedTaskSchema: z.ZodType<PublishedTask> = z
  .object({
    id: z.string().min(1),
    confirmedContent: contentSchema,
    confirmedIndustry: z.string(),
    confirmedScore: scoreSchema,
    confirmedAt: z.string(),
    publishedAt: z.string(),
  })
  .strict();

const proposeInputSchema = proposalSchema
  .pick({
    teamId: true,
    idea: true,
    plan: true,
    deadline: true,
    prototypeUrl: true,
  })
  .strict();
const resultInputSchema = proposalSchema
  .pick({ resultDescription: true, resultUrl: true })
  .strict();
const decisionSchema = z.enum(["accepted", "rejected"]);
const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
});

export type ProposeInput = z.input<typeof proposeInputSchema>;
export type ResultInput = z.input<typeof resultInputSchema>;
export type Decision = z.infer<typeof decisionSchema>;

export class CollaborationApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "CollaborationApiError";
  }
}

const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const timeoutMs = 20_000;

function validatedInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new CollaborationApiError(
      "INVALID_INPUT",
      null,
      "Check the fields before sending.",
    );
  return parsed.data;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (controller.signal.aborted)
        throw new CollaborationApiError("TIMEOUT", null, "Server did not respond in time.");
      if (response.ok)
        throw new CollaborationApiError(
          "INVALID_RESPONSE",
          response.status,
          "Server returned invalid JSON.",
        );
      throw new CollaborationApiError(
        "HTTP_ERROR",
        response.status,
        `Request failed (${response.status}).`,
      );
    }
    if (!response.ok) {
      const error = errorResponseSchema.safeParse(payload);
      throw new CollaborationApiError(
        error.success ? error.data.code : "HTTP_ERROR",
        response.status,
        error.success
          ? error.data.error
          : `Request failed (${response.status}).`,
      );
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success)
      throw new CollaborationApiError(
        "INVALID_RESPONSE",
        response.status,
        "Server returned an invalid response.",
      );
    return parsed.data;
  } catch (error) {
    if (error instanceof CollaborationApiError) throw error;
    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw new CollaborationApiError(
        "TIMEOUT",
        null,
        "Server did not respond in time.",
      );
    throw new CollaborationApiError(
      "NETWORK_ERROR",
      null,
      "Could not reach the server.",
    );
  } finally {
    clearTimeout(timer);
  }
}

function query(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) params.set(key, value);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export const collaborationGateway = {
  catalog(filters: CatalogFilters = {}): Promise<PublishedTask[]> {
    return request(`/api/tasks${query(filters)}`, z.array(publishedTaskSchema));
  },
  publicTask(id: string): Promise<PublishedTask> {
    return request(
      `/api/catalog/${encodeURIComponent(id)}`,
      publishedTaskSchema,
    );
  },
  teams() {
    return request("/api/teams", z.array(teamSchema));
  },
  proposals(taskId?: string) {
    return request(
      `/api/business/proposals${query({ taskId })}`,
      z.array(proposalSchema),
    );
  },
  async propose(taskId: string, input: ProposeInput) {
    return request(
      `/api/tasks/${encodeURIComponent(taskId)}/proposals`,
      proposalSchema,
      "POST",
      validatedInput(proposeInputSchema, input),
    );
  },
  async decide(id: string, status: Decision) {
    return request(
      `/api/proposals/${encodeURIComponent(id)}`,
      proposalSchema,
      "PATCH",
      { status: validatedInput(decisionSchema, status) },
    );
  },
  async result(id: string, input: ResultInput) {
    return request(
      `/api/proposals/${encodeURIComponent(id)}/result`,
      proposalSchema,
      "PATCH",
      validatedInput(resultInputSchema, input),
    );
  },
  confirmStage(id: string) {
    return request(
      `/api/proposals/${encodeURIComponent(id)}/confirm-stage`,
      proposalSchema,
      "POST",
      { acknowledged: true },
    );
  },
};
