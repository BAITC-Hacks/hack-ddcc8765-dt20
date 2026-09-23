import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyContent } from "../src/lib/contracts";
import { calculateScore } from "../src/lib/scoring";

const taskId = "00000000-0000-4000-8000-000000000001";
const teamId = "00000000-0000-4000-8000-000000000002";
const proposalId = "00000000-0000-4000-8000-000000000003";
const published = {
  id: taskId,
  confirmedContent: emptyContent(),
  confirmedIndustry: "Services",
  confirmedScore: calculateScore(emptyContent()),
  confirmedAt: "2026-09-23T00:00:00.000Z",
  publishedAt: "2026-09-23T00:00:00.000Z",
};
const team = {
  id: teamId,
  name: "Demo team",
  interests: [],
  skills: [],
  technologies: [],
  xp: 0,
};
const proposal = {
  id: proposalId,
  taskId,
  teamId,
  idea: "Build a form",
  plan: "Prototype and test",
  deadline: "7 days",
  prototypeUrl: null,
  status: "pending",
  resultDescription: null,
  resultUrl: null,
  stageConfirmedAt: null,
  createdAt: "2026-09-23T00:00:00.000Z",
};
const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200 });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "api");
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("collaboration gateway", () => {
  it("serializes catalog filters and returns only validated public tasks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([published]));
    vi.stubGlobal("fetch", fetchMock);
    const { collaborationGateway } =
      await import("../src/lib/collaboration-gateway");
    expect(
      await collaborationGateway.catalog({
        industry: "Food & drink",
        level: "draft",
      }),
    ).toEqual([published]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/tasks?industry=Food+%26+drink&level=draft",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
      method: "GET",
    });
  });

  it("encodes identifiers and optional proposal filter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(published))
      .mockResolvedValueOnce(ok([proposal]))
      .mockResolvedValueOnce(ok([team]));
    vi.stubGlobal("fetch", fetchMock);
    const { collaborationGateway } =
      await import("../src/lib/collaboration-gateway");
    await collaborationGateway.publicTask("a/b ?");
    await collaborationGateway.proposals("a/b ?");
    expect(await collaborationGateway.teams()).toEqual([team]);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/catalog/a%2Fb%20%3F",
      "/api/business/proposals?taskId=a%2Fb+%3F",
      "/api/teams",
    ]);
  });

  it("sends exact proposal, decision, result, and stage bodies", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok(proposal));
    vi.stubGlobal("fetch", fetchMock);
    const { collaborationGateway } =
      await import("../src/lib/collaboration-gateway");
    await collaborationGateway.propose(taskId, {
      teamId,
      idea: "Build a form",
      plan: "Prototype and test",
      deadline: "7 days",
      prototypeUrl: null,
    });
    await collaborationGateway.decide(proposalId, "accepted");
    await collaborationGateway.result(proposalId, {
      resultDescription: "Delivered",
      resultUrl: null,
    });
    await collaborationGateway.confirmStage(proposalId);
    expect(
      fetchMock.mock.calls.map(([path, options]) => [
        path,
        options.method,
        JSON.parse(options.body),
      ]),
    ).toEqual([
      [
        `/api/tasks/${taskId}/proposals`,
        "POST",
        {
          teamId,
          idea: "Build a form",
          plan: "Prototype and test",
          deadline: "7 days",
          prototypeUrl: null,
        },
      ],
      [`/api/proposals/${proposalId}`, "PATCH", { status: "accepted" }],
      [
        `/api/proposals/${proposalId}/result`,
        "PATCH",
        { resultDescription: "Delivered", resultUrl: null },
      ],
      [
        `/api/proposals/${proposalId}/confirm-stage`,
        "POST",
        { acknowledged: true },
      ],
    ]);
    expect(
      fetchMock.mock.calls.every(
        ([, options]) => options.credentials === "include",
      ),
    ).toBe(true);
  });

  it("rejects client-assigned status or XP before sending a proposal", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { collaborationGateway } =
      await import("../src/lib/collaboration-gateway");
    await expect(
      collaborationGateway.propose(taskId, {
        teamId,
        idea: "Build",
        plan: "Test",
        deadline: "Tomorrow",
        prototypeUrl: null,
        xp: 100,
      } as never),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed successes and preserves server error details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok([{ ...team, xp: "100" }]))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "CONFLICT", error: "Already decided" }),
          { status: 409 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { collaborationGateway, CollaborationApiError } =
      await import("../src/lib/collaboration-gateway");
    await expect(collaborationGateway.teams()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 200,
    });
    await expect(
      collaborationGateway.decide(proposalId, "accepted"),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "Already decided",
    });
    expect(CollaborationApiError).toBeDefined();
  });

  it("rejects public payloads that expose editable task data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ok({ ...published, draft: emptyContent() })),
    );
    const { collaborationGateway } =
      await import("../src/lib/collaboration-gateway");
    await expect(collaborationGateway.publicTask(taskId)).rejects.toMatchObject(
      { code: "INVALID_RESPONSE" },
    );
  });

  it("reports network failures without using local data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const { collaborationGateway } =
      await import("../src/lib/collaboration-gateway");
    await expect(collaborationGateway.catalog()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: null,
    });
  });

  it("aborts a request after 20 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_path: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          ),
      ),
    );
    const { collaborationGateway } =
      await import("../src/lib/collaboration-gateway");
    const pending = expect(collaborationGateway.teams()).rejects.toMatchObject({
      code: "TIMEOUT",
      status: null,
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
  });

  it("honors a relative API base URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "/backend/");
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    vi.stubGlobal("fetch", fetchMock);
    const { collaborationGateway } =
      await import("../src/lib/collaboration-gateway");
    await collaborationGateway.catalog();
    expect(fetchMock.mock.calls[0][0]).toBe("/backend/api/tasks");
  });
});
