import assert from "node:assert/strict";
import fs from "node:fs";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import "./ts-loader.mjs";

const { demoTasks, demoTeams, demoProposals } = await import("../src/lib/demo-data.ts");
const { taskSchema } = await import("../src/lib/contracts.ts");
const local = fs.existsSync(".env.local") ? parseEnv(fs.readFileSync(".env.local", "utf8")) : {};
const env = { ...local, ...process.env };
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Supabase service credentials are required.");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = env.DEMO_OWNER_ID || "demo-business";

async function checked(label, operation) {
  const { data, error } = await operation;
  if (error) throw new Error(`${label} failed (${error.code || "storage error"}).`);
  return data;
}

async function existingIds(table, ids) {
  const rows = await checked(`Inspect ${table}`, db.from(table).select("id").in("id", ids));
  return new Set(rows.map((row) => row.id));
}

async function seed(table, entries, map) {
  const ids = entries.map((entry) => entry.id);
  const before = await existingIds(table, ids);
  const missing = entries.filter((entry) => !before.has(entry.id));
  if (missing.length) {
    await checked(`Seed ${table}`, db.from(table).upsert(missing.map(map), { onConflict: "id", ignoreDuplicates: true }));
  }
  const after = await existingIds(table, ids);
  assert.equal(after.size, entries.length, `${table} fixture count`);
  return { inserted: missing.length, existing: before.size, actual: after.size };
}

const teams = await seed("teams", demoTeams, (team) => team);
const tasks = await seed("tasks", demoTasks, (task) => ({ id: task.id, owner_id: owner, payload: task, revision: task.revision }));
const proposals = await seed("proposals", demoProposals, (proposal) => ({ id: proposal.id, task_id: proposal.taskId, team_id: proposal.teamId, payload: proposal }));
const rows = await checked("Verify tasks", db.from("tasks").select("id,owner_id,payload").in("id", demoTasks.map((task) => task.id)));
assert.equal(rows.filter((row) => row.owner_id === owner && row.payload.publishedAt).length, 5, "Five owned published cards expected");
assert.equal(rows.filter((row) => row.owner_id === owner && !row.payload.publishedAt).length, 5, "Five owned drafts expected");
const actual = rows.map((row) => taskSchema.parse(row.payload));
const levels = [...new Set(actual.filter((task) => task.publishedAt).map((task) => task.confirmedScore?.level))].sort();
assert.deepEqual(levels, ["draft", "priority", "ready", "working"], "Published fixture levels are incomplete");
console.log(JSON.stringify({ teams, tasks, proposals, ownedDrafts: 5, ownedPublished: 5, levels }));
