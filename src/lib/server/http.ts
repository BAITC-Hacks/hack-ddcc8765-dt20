import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "./service";

/** Shared demo access only; this is not per-user authentication. */
export function guardRequest(request: Request) {
  const password = process.env.DEMO_ACCESS_PASSWORD;
  if (process.env.NODE_ENV === "production" && !password)
    throw new ApiError(
      503,
      "DEMO_ACCESS_NOT_CONFIGURED",
      "Для демостенда настройте DEMO_ACCESS_PASSWORD.",
    );
  if (password) {
    const auth = request.headers.get("authorization") ?? "";
    const decoded = auth.startsWith("Basic ")
      ? Buffer.from(auth.slice(6), "base64").toString("utf8")
      : "";
    const colon = decoded.indexOf(":");
    const supplied = colon >= 0 ? decoded.slice(colon + 1) : "";
    const hash = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(hash(password), hash(supplied)))
      throw new ApiError(401, "AUTH_REQUIRED", "Войдите в демостенд.");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const target = new URL(request.url);
    // Next.js may normalize request.url to localhost; Host preserves the
    // browser's destination, including the development port.
    const host = request.headers.get("host");
    if (host) target.host = host;
    if (origin && origin !== target.origin)
      throw new ApiError(
        403,
        "ORIGIN_REJECTED",
        "Запрос с другого сайта запрещён.",
      );
  }
}

export async function readJson(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError(415, "JSON_REQUIRED", "Ожидается JSON.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApiError(400, "INVALID_JSON", "Тело запроса отсутствует.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      throw new ApiError(413, "BODY_TOO_LARGE", "Запрос слишком большой.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Некорректный JSON.");
  }
}

let aiWindow = { start: 0, count: 0 };
export function guardAiRate() {
  const now = Date.now();
  if (now - aiWindow.start >= 60000) aiWindow = { start: now, count: 0 };
  if (++aiWindow.count > 10)
    throw new ApiError(
      429,
      "AI_RATE_LIMIT",
      "Слишком много AI-запросов. Подождите минуту.",
    );
}
