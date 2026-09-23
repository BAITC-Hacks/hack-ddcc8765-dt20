import assert from "node:assert/strict";
import fs from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const local = fs.existsSync(".env.local") ? parseEnv(fs.readFileSync(".env.local", "utf8")) : {};
const env = { ...local, ...process.env };
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Supabase service credentials are required.");
const base = (env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const taskId = randomUUID();
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function request(path, method = "GET", body, expectedStatus = 200) {
  const headers = { "Content-Type": "application/json" };
  if (env.DEMO_ACCESS_PASSWORD) headers.Authorization = "Basic " + Buffer.from(`demo:${env.DEMO_ACCESS_PASSWORD}`).toString("base64");
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, expectedStatus, `${method} ${path}: HTTP ${response.status}, expected ${expectedStatus}`);
  return response.json();
}

const content = Object.fromEntries(["title", "context", "need", "users", "dataDescription", "dataAccess", "expectedResult", "successMetric", "successTarget", "deadline", "constraints", "contact", "interaction", "feedback"].map((key) => [key, ""]));
content.title = "Проверка жизненного цикла демонстрационной задачи";
const draft = { rawText: "Синтетическая проверка API", industry: "Другое", draft: content, questions: [], answers: {}, step: 3, source: "fallback" };
const xp = (teams, id) => teams.find((team) => team.id === id)?.xp;

try {
  const teams = await request("/api/teams");
  assert.ok(teams.length >= 5, "Five demo teams required");
  const publishedBefore = await request("/api/tasks");
  const task = await request("/api/tasks", "POST", { id: taskId, ...draft });
  assert.equal(task.publishedAt, null);
  assert.ok(!(await request("/api/tasks")).some((item) => item.id === taskId), "Unpublished draft leaked into catalog");
  const confirmedZero = await request(`/api/tasks/${taskId}/confirm`, "POST", { acknowledged: true, expectedRevision: task.revision });
  assert.equal(confirmedZero.confirmedScore.total, 0);
  const published = await request(`/api/tasks/${taskId}/publish`, "POST", { expectedRevision: confirmedZero.revision });
  assert.equal(published.confirmedScore.total, 0);
  assert.equal((await request("/api/tasks")).length, publishedBefore.length + 1);

  const changedDraft = { ...content, users: "Операторы демонстрационного стенда." };
  const saved = await request(`/api/tasks/${taskId}/draft`, "PATCH", { ...draft, expectedRevision: published.revision, draft: changedDraft });
  let publicTask = await request(`/api/catalog/${taskId}`);
  assert.equal(publicTask.confirmedContent.users, "", "Unconfirmed revision leaked publicly");

  const reviewed = await request(`/api/tasks/${taskId}/review`, "POST", { expectedRevision: saved.revision });
  assert.ok(reviewed.qualityReview, "Review did not persist");
  assert.equal(reviewed.qualityReview.version, "quality-v1");
  const revised = await request(`/api/tasks/${taskId}/draft`, "PATCH", { ...draft, expectedRevision: reviewed.revision, draft: { ...changedDraft, users: "Администратор и оператор демонстрационного стенда." } });
  assert.equal(revised.qualityReview, null, "Draft revision must invalidate review");
  await request(`/api/tasks/${taskId}/confirm`, "POST", { acknowledged: true, expectedRevision: saved.revision }, 409);
  const confirmed = await request(`/api/tasks/${taskId}/confirm`, "POST", { acknowledged: true, expectedRevision: revised.revision });
  publicTask = await request(`/api/catalog/${taskId}`);
  assert.equal(publicTask.confirmedContent.users, revised.draft.users);
  assert.equal(publicTask.confirmedScore.total, confirmed.confirmedScore.total);
  assert.ok(!Object.hasOwn(publicTask, "draft"), "Public view exposed draft");

  const makeProposal = (teamId) => request(`/api/tasks/${taskId}/proposals`, "POST", { teamId, idea: "Проверить API на синтетических данных", plan: "Собрать прототип и показать результат", deadline: "Две недели", prototypeUrl: null });
  const first = await makeProposal(teams[0].id);
  const second = await makeProposal(teams[1].id);
  const rejected = await makeProposal(teams[2].id);
  await request(`/api/proposals/${rejected.id}`, "PATCH", { status: "rejected" });
  for (const proposal of [first, second]) {
    await request(`/api/proposals/${proposal.id}`, "PATCH", { status: "accepted" });
    await request(`/api/proposals/${proposal.id}/result`, "PATCH", { resultDescription: "Синтетический результат проверки", resultUrl: null });
  }
  const beforeConfirmation = await request("/api/teams");
  assert.equal(xp(beforeConfirmation, teams[0].id), xp(teams, teams[0].id));
  assert.equal(xp(beforeConfirmation, teams[1].id), xp(teams, teams[1].id));
  for (const proposal of [first, second]) {
    await request(`/api/proposals/${proposal.id}/confirm-stage`, "POST", { acknowledged: true });
    await request(`/api/proposals/${proposal.id}/confirm-stage`, "POST", { acknowledged: true });
  }
  const afterConfirmation = await request("/api/teams");
  assert.equal(xp(afterConfirmation, teams[0].id), xp(teams, teams[0].id) + 10);
  assert.equal(xp(afterConfirmation, teams[1].id), xp(teams, teams[1].id) + 10);
  assert.equal(xp(afterConfirmation, teams[2].id), xp(teams, teams[2].id));
  console.log("PASS: drafts, zero-score publishing, revisions, review invalidation, public snapshot, two accepted teams, rejection, and one-time XP.");
} finally {
  // Delete only records linked to this run's random task ID.
  const proposals = await db.from("proposals").delete().eq("task_id", taskId);
  const task = await db.from("tasks").delete().eq("id", taskId);
  if (proposals.error || task.error) {
    console.error("Cleanup failed for temporary smoke task", taskId);
    process.exitCode = 1;
  } else console.log("Temporary smoke records removed.");
}
