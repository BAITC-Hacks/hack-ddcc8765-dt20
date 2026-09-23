import fs from "node:fs";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = {
  ...process.env,
  ...parseEnv(fs.readFileSync(".env.local", "utf8")),
};
const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const taskId = randomUUID();
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
async function request(path, method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  if (env.DEMO_ACCESS_PASSWORD)
    headers.Authorization =
      "Basic " +
      Buffer.from("demo:" + env.DEMO_ACCESS_PASSWORD).toString("base64");
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(
    response.status,
    200,
    `${method} ${path}: HTTP ${response.status}`,
  );
  return response.json();
}
const content = Object.fromEntries(
  [
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
  ].map((k) => [k, ""]),
);
content.title = "Временная проверочная задача";
const draft = {
  rawText: "Синтетическая проверка API",
  industry: "Другое",
  draft: content,
  questions: [],
  answers: {},
  step: 3,
  source: "fallback",
};
try {
  const teams = await request("/api/teams");
  assert.ok(teams.length >= 5, "Schema must contain five demo teams");
  await request("/api/tasks", "POST", { id: taskId, ...draft });
  const confirmed = await request(`/api/tasks/${taskId}/confirm`, "POST", {
    acknowledged: true,
    expectedRevision: 0,
  });
  const published = await request(`/api/tasks/${taskId}/publish`, "POST", {
    expectedRevision: confirmed.revision,
  });
  assert.equal(published.confirmedScore.total, 0);
  const saved = await request(`/api/tasks/${taskId}/draft`, "PATCH", {
    ...draft,
    expectedRevision: published.revision,
    draft: { ...content, users: "Администратор" },
  });
  let publicTask = await request(`/api/catalog/${taskId}`);
  assert.equal(publicTask.confirmedContent.users, "");
  assert.equal(Object.hasOwn(publicTask, "draft"), false);
  await request(`/api/tasks/${taskId}/confirm`, "POST", {
    acknowledged: true,
    expectedRevision: saved.revision,
  });
  publicTask = await request(`/api/catalog/${taskId}`);
  assert.equal(publicTask.confirmedScore.total, 10);
  const proposal = await request(`/api/tasks/${taskId}/proposals`, "POST", {
    teamId: teams[0].id,
    idea: "Проверить API",
    plan: "Создать пример",
    deadline: "1 день",
    prototypeUrl: null,
  });
  await request(`/api/proposals/${proposal.id}`, "PATCH", {
    status: "accepted",
  });
  await request(`/api/proposals/${proposal.id}/result`, "PATCH", {
    resultDescription: "Синтетический результат проверки",
    resultUrl: null,
  });
  await request(`/api/proposals/${proposal.id}/confirm-stage`, "POST", {
    acknowledged: true,
  });
  await request(`/api/proposals/${proposal.id}/confirm-stage`, "POST", {
    acknowledged: true,
  });
  const updated = await request("/api/teams");
  assert.equal(updated.find((t) => t.id === teams[0].id).xp, teams[0].xp + 10);
  console.log(
    "PASS: real Supabase task lifecycle, public snapshot, proposals and idempotent XP.",
  );
} finally {
  // Delete only this run's randomly identified test records, never user data.
  const proposals = await db.from("proposals").delete().eq("task_id", taskId);
  const task = await db.from("tasks").delete().eq("id", taskId);
  if (proposals.error || task.error) {
    console.error("Cleanup failed for smoke task", taskId);
    process.exitCode = 1;
  } else console.log("Temporary smoke records removed.");
}
