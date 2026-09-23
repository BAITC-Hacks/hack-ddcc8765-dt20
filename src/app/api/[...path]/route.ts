import { z, ZodError } from "zod";
import { createRepository } from "@/lib/server/database";
import { TaskService, ApiError } from "@/lib/server/service";
import {
  assistQuestions,
  assistCard,
  questionsInput,
  cardInput,
} from "@/lib/server/ai";
import { modelProvider } from "@/lib/server/model";
import { guardRequest, guardAiRate, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  try {
    guardRequest(request);
    const url = new URL(request.url);
    const path = url.pathname
      .replace(/^\/api\//, "")
      .split("/")
      .map(decodeURIComponent);
    const method = request.method;
    if (method === "GET" && path.join("/") === "health")
      return Response.json({ ok: true, mode: "shared-demo" }, { headers });
    if (method === "POST" && path[0] === "ai" && path.length === 2) {
      if (!["questions", "card"].includes(path[1]))
        throw new ApiError(404, "NOT_FOUND", "Маршрут не найден.");
      guardAiRate();
      const body = await readJson(request);
      const provider = modelProvider();
      const result =
        path[1] === "questions"
          ? await assistQuestions(questionsInput.parse(body), provider)
          : await assistCard(cardInput.parse(body), provider);
      return Response.json(result, { headers });
    }
    const service = new TaskService(
      createRepository(),
      process.env.DEMO_OWNER_ID || "demo-business",
    );
    let result: unknown;
    if (method === "GET" && path.join("/") === "tasks") {
      const filters = z
        .object({
          industry: z.string().max(100).optional(),
          level: z.enum(["draft", "working", "ready", "priority"]).optional(),
        })
        .parse(Object.fromEntries(url.searchParams));
      result = await service.catalog(filters);
    } else if (method === "POST" && path.join("/") === "demo/seed") {
      z.object({ acknowledged: z.literal(true) })
        .strict()
        .parse(await readJson(request));
      result = await service.seedDemo();
    } else if (method === "GET" && path.join("/") === "student/proposals")
      result = await service.teamProposals(
        z.uuid().parse(url.searchParams.get("teamId")),
      );
    else if (method === "POST" && path.join("/") === "tasks")
      result = await service.create(await readJson(request));
    else if (method === "GET" && path.join("/") === "teams")
      result = await service.teams();
    else if (method === "GET" && path.join("/") === "business/tasks")
      result = await service.businessTasks();
    else if (method === "GET" && path.join("/") === "business/proposals")
      result = await service.proposals(
        url.searchParams.get("taskId") || undefined,
      );
    else if (method === "GET" && path[0] === "catalog" && path.length === 2)
      result = await service.publicTask(path[1]);
    else if (path[0] === "tasks" && path.length >= 2 && path.length <= 3) {
      const id = path[1];
      if (method === "GET" && path.length === 2) result = await service.get(id);
      else if (method === "PATCH" && path[2] === "draft")
        result = await service.save(id, await readJson(request));
      else if (method === "POST" && path[2] === "confirm")
        result = await service.confirm(id, await readJson(request));
      else if (method === "POST" && path[2] === "publish") {
        result = await service.publish(id, await readJson(request));
      } else if (method === "POST" && path[2] === "proposals")
        result = await service.propose(id, await readJson(request));
    } else if (
      path[0] === "proposals" &&
      path.length >= 2 &&
      path.length <= 3
    ) {
      const id = path[1];
      if (method === "PATCH" && path.length === 2)
        result = await service.decide(id, await readJson(request));
      else if (method === "PATCH" && path[2] === "result")
        result = await service.result(id, await readJson(request));
      else if (method === "POST" && path[2] === "confirm-stage")
        result = await service.confirmStage(id, await readJson(request));
    }
    if (result === undefined)
      throw new ApiError(404, "NOT_FOUND", "Маршрут не найден.");
    return Response.json(result, { headers });
  } catch (error) {
    const api =
      error instanceof ApiError
        ? error
        : error instanceof ZodError || error instanceof URIError
          ? new ApiError(400, "INVALID_INPUT", "Проверьте поля запроса.")
          : new ApiError(
              500,
              "INTERNAL_ERROR",
              "Не удалось выполнить операцию.",
            );
    if (api.status === 401)
      headers["WWW-Authenticate"] =
        'Basic realm="SanaBrief demo", charset="UTF-8"';
    if (api.status === 429) headers["Retry-After"] = "60";
    return Response.json(
      { error: api.message, code: api.code },
      { status: api.status, headers },
    );
  }
}

export { handle as GET, handle as POST, handle as PATCH };
