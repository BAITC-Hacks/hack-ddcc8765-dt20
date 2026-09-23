import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newTask } from "../src/lib/contracts";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "api");
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("HTTP integration boundary", () => {
  it("saves only editable fields, never a client-assigned official score", async () => {
    const task = newTask("api-task");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(task), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { gateway } = await import("../src/lib/gateway");
    await gateway.save(task);
    const [path, options] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/tasks/api-task/draft");
    expect(options.credentials).toBe("include");
    expect(options.headers["If-Match"]).toBe(JSON.stringify(task.updatedAt));
    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty("confirmedScore");
    expect(body).not.toHaveProperty("confirmedContent");
    expect(body).not.toHaveProperty("publishedAt");
  });
  it.each([409, 412])(
    "surfaces version conflict %i without retrying over newer data",
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("", { status }));
      vi.stubGlobal("fetch", fetchMock);
      const { gateway } = await import("../src/lib/gateway");
      await expect(gateway.save(newTask("conflict"))).rejects.toMatchObject({
        name: "SaveConflictError",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects a malformed question response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ questions: [], source: "ai" }), {
          status: 200,
        }),
      ),
    );
    const { gateway } = await import("../src/lib/gateway");
    await expect(gateway.questions(newTask("api"))).rejects.toThrow(
      "некорректный ответ",
    );
  });
  it("does not silently save locally when the server fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    const { gateway } = await import("../src/lib/gateway");
    await expect(gateway.save(newTask("api"))).rejects.toThrow("не сохранил");
  });
  it("reports a disconnected network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const { gateway } = await import("../src/lib/gateway");
    await expect(gateway.get("api")).rejects.toThrow("Нет связи с сервером");
  });
  it("aborts a slow AI request after the documented timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const { gateway } = await import("../src/lib/gateway");
    const response = expect(gateway.questions(newTask("slow"))).rejects.toThrow(
      "20 секунд",
    );
    await vi.advanceTimersByTimeAsync(20000);
    await response;
  });
});
