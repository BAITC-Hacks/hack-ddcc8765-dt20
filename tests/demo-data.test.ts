import { describe, expect, it } from "vitest";
import { demoFixtureSummary, demoProposals, demoTasks, demoTeams } from "../src/lib/demo-data";
import { taskSchema } from "../src/lib/contracts";
import { proposalSchema } from "../src/lib/collaboration-contracts";
import { calculateScore } from "../src/lib/scoring";

describe("synthetic demo fixtures", () => {
  it("has five unpublished drafts and five published cards spanning every readiness level", () => {
    expect(demoFixtureSummary).toEqual({
      drafts: 5,
      published: 5,
      levels: ["draft", "priority", "ready", "working"],
      proposals: 5,
      teams: 5,
    });
    for (const task of demoTasks) {
      expect(taskSchema.safeParse(task).success).toBe(true);
      expect(task.rawText.length).toBeGreaterThan(30);
      if (task.publishedAt) {
        expect(task.confirmedContent).toEqual(task.draft);
        expect(task.confirmedScore).toEqual(calculateScore(task.draft));
      } else {
        expect(task.confirmedContent).toBeNull();
        expect(task.confirmedScore).toBeNull();
      }
    }
  });

  it("has coherent proposal relationships and a result awaiting confirmation", () => {
    const tasks = new Map(demoTasks.map((task) => [task.id, task]));
    expect(new Set(demoProposals.map((p) => p.taskId)).size).toBeLessThan(demoProposals.length);
    for (const proposal of demoProposals) {
      expect(proposalSchema.safeParse(proposal).success).toBe(true);
      expect(tasks.get(proposal.taskId)?.publishedAt).toBeTruthy();
      expect(demoTeams.some((team) => team.id === proposal.teamId)).toBe(true);
    }
    expect(demoProposals.some((p) => p.status === "accepted" && p.resultDescription && !p.stageConfirmedAt)).toBe(true);
  });

  it("uses stable namespaced IDs and only synthetic contacts", () => {
    expect(demoTasks.map((task) => task.id)).toEqual(Array.from({ length: 10 }, (_, i) => `d3a01000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`));
    expect(demoProposals.map((proposal) => proposal.id)).toEqual(Array.from({ length: 5 }, (_, i) => `d3a02000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`));
    for (const task of demoTasks) {
      expect(task.updatedAt).toBe("2026-09-20T12:00:00.000Z");
      if (task.publishedAt) expect(task.confirmedAt).toBe("2026-09-20T12:00:00.000Z");
      if (task.draft.contact) expect(task.draft.contact).toMatch(/^[\w-]+@example\.com$/);
    }
    expect(demoProposals.every((proposal) => proposal.createdAt === "2026-09-20T12:00:00.000Z")).toBe(true);
  });
});
