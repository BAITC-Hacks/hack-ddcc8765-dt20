import "server-only";
import { createClient } from "@supabase/supabase-js";
import { taskSchema } from "../contracts";
import {
  ApiError,
  proposalSchema,
  type Repository,
  type Team,
} from "./service";

export function createRepository(): Repository {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new ApiError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "Подключение к базе ещё не настроено.",
    );
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  function checked<T>(result: { data: T; error: unknown }): T {
    if (result.error)
      throw new ApiError(
        503,
        "STORAGE_UNAVAILABLE",
        "База недоступна. Проверьте подключение и применение schema.sql.",
      );
    return result.data;
  }
  // Supabase limits responses to 1000 rows by default; explicitly page every list.
  async function rows(table: "tasks" | "proposals", owner?: string) {
    const result: { payload: unknown; revision: number }[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = db
        .from(table)
        .select("payload,revision")
        .order("id")
        .range(offset, offset + 499);
      if (owner) query = query.eq("owner_id", owner);
      const page = checked(await query) ?? [];
      result.push(...page);
      if (page.length < 500) return result;
    }
  }
  return {
    async createTask(owner, task) {
      checked(
        await db
          .from("tasks")
          .upsert(
            { id: task.id, owner_id: owner, payload: task },
            { onConflict: "id", ignoreDuplicates: true },
          ),
      );
    },
    async getTask(id) {
      const row = checked(
        await db
          .from("tasks")
          .select("payload,owner_id,revision")
          .eq("id", id)
          .maybeSingle(),
      );
      return row
        ? {
            task: { ...taskSchema.parse(row.payload), revision: row.revision },
            owner: row.owner_id,
            revision: row.revision,
          }
        : null;
    },
    async listTasks(owner) {
      return (await rows("tasks", owner)).map((r) => ({
        ...taskSchema.parse(r.payload),
        revision: r.revision,
      }));
    },
    async saveTask(id, revision, task) {
      const data = checked(
        await db
          .from("tasks")
          .update({ payload: task, revision: revision + 1 })
          .eq("id", id)
          .eq("revision", revision)
          .select("id"),
      );
      return data?.length === 1;
    },
    async listTeams() {
      return (checked(
        await db
          .from("teams")
          .select("id,name,interests,skills,technologies")
          .order("id"),
      ) ?? []) as Team[];
    },
    async createProposal(p) {
      checked(
        await db.from("proposals").upsert(
          {
            id: p.id,
            task_id: p.taskId,
            team_id: p.teamId,
            payload: p,
          },
          { onConflict: "id", ignoreDuplicates: true },
        ),
      );
    },
    async getProposal(id) {
      const row = checked(
        await db
          .from("proposals")
          .select("payload,revision")
          .eq("id", id)
          .maybeSingle(),
      );
      return row
        ? {
            proposal: proposalSchema.parse(row.payload),
            revision: row.revision,
          }
        : null;
    },
    async listProposals() {
      return (await rows("proposals")).map((r) =>
        proposalSchema.parse(r.payload),
      );
    },
    async saveProposal(id, revision, p) {
      const data = checked(
        await db
          .from("proposals")
          .update({ payload: p, revision: revision + 1 })
          .eq("id", id)
          .eq("revision", revision)
          .select("id"),
      );
      return data?.length === 1;
    },
  };
}
