export type AiKind = "questions" | "card" | "quality";
type Category = "configuration" | "provider" | "schema" | "timeout" | "rate_limit";
type Status = "failure" | "fallback";

/** Only fixed labels and timing leave the AI boundary. */
export function aiDiagnostic(
  event: "ai_attempt" | "ai_fallback",
  kind: AiKind,
  category: Category,
  status: Status,
  durationMs: number,
) {
  console.warn(JSON.stringify({
    event,
    kind,
    category,
    status,
    durationMs: Math.max(0, Math.round(durationMs)),
  }));
}

export function providerCategory(error: unknown): "provider" | "timeout" | "rate_limit" {
  if (!error || typeof error !== "object") return "provider";
  const candidate = error as { name?: unknown; status?: unknown };
  if (candidate.status === 429) return "rate_limit";
  if (candidate.name === "TimeoutError" || candidate.name === "APIConnectionTimeoutError")
    return "timeout";
  return "provider";
}
