import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NavetItem, Project } from "../types";
import type { NavetStore } from "./store";
import { env } from "./env";

// Column mapping camelCase <-> snake_case
const ITEM_COLUMNS: Record<keyof NavetItem, string> = {
  id: "id",
  title: "title",
  description: "description",
  type: "type",
  status: "status",
  source: "source",
  projectId: "project_id",
  dueDate: "due_date",
  dueTime: "due_time",
  priority: "priority",
  estimatedTime: "estimated_time",
  waitingFor: "waiting_for",
  person: "person",
  lastFollowUp: "last_follow_up",
  stage: "stage",
  contact: "contact",
  eventDate: "event_date",
  origin: "origin",
  externalId: "external_id",
  externalProvider: "external_provider",
  externalListId: "external_list_id",
  externalUpdatedAt: "external_updated_at",
  completedAt: "completed_at",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

type Row = Record<string, unknown>;

function itemToRow(userId: string, item: NavetItem): Row {
  const row: Row = { user_id: userId };
  for (const [k, col] of Object.entries(ITEM_COLUMNS)) row[col] = item[k as keyof NavetItem];
  return row;
}

function rowToItem(row: Row): NavetItem {
  const item = {} as Record<string, unknown>;
  for (const [k, col] of Object.entries(ITEM_COLUMNS)) item[k] = row[col] ?? null;
  // Postgres "time" comes back as HH:mm:ss
  if (typeof item.dueTime === "string") item.dueTime = (item.dueTime as string).slice(0, 5);
  return item as unknown as NavetItem;
}

function projectToRow(userId: string, p: Project): Row {
  return {
    user_id: userId,
    id: p.id,
    name: p.name,
    description: p.description,
    aliases: p.aliases,
    color: p.color,
    archived: p.archived,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function rowToProject(r: Row): Project {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    aliases: (r.aliases as string[]) ?? [],
    color: r.color as string,
    archived: Boolean(r.archived),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export class SupabaseStore implements NavetStore {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor() {
    this.db = createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`Supabase: ${res.error.message}`);
    return res.data;
  }

  async listItems(userId: string) {
    const rows = this.check(await this.db.from("navet_items").select("*").eq("user_id", userId));
    return (rows ?? []).map(rowToItem);
  }
  async getItem(userId: string, id: string) {
    const row = this.check(await this.db.from("navet_items").select("*").eq("user_id", userId).eq("id", id).maybeSingle());
    return row ? rowToItem(row) : null;
  }
  async insertItems(userId: string, items: NavetItem[]) {
    if (!items.length) return;
    this.check(await this.db.from("navet_items").insert(items.map((i) => itemToRow(userId, i))));
  }
  async updateItem(userId: string, item: NavetItem) {
    this.check(await this.db.from("navet_items").upsert(itemToRow(userId, item)));
  }
  async deleteItem(userId: string, id: string) {
    this.check(await this.db.from("navet_items").delete().eq("user_id", userId).eq("id", id));
  }
  async listProjects(userId: string) {
    const rows = this.check(await this.db.from("navet_projects").select("*").eq("user_id", userId));
    return (rows ?? []).map(rowToProject);
  }
  async insertProjects(userId: string, projects: Project[]) {
    if (!projects.length) return;
    this.check(await this.db.from("navet_projects").insert(projects.map((p) => projectToRow(userId, p))));
  }
  async updateProject(userId: string, project: Project) {
    this.check(await this.db.from("navet_projects").upsert(projectToRow(userId, project)));
  }
  async deleteProject(userId: string, id: string) {
    this.check(await this.db.from("navet_projects").delete().eq("user_id", userId).eq("id", id));
  }
  async getKV<T>(userId: string, key: string) {
    const row = this.check(
      await this.db.from("navet_kv").select("value").eq("user_id", userId).eq("key", key).maybeSingle(),
    );
    return row ? (row.value as T) : null;
  }
  async setKV<T>(userId: string, key: string, value: T) {
    this.check(await this.db.from("navet_kv").upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }));
  }
  async clearUser(userId: string) {
    for (const table of ["navet_items", "navet_projects", "navet_kv"]) {
      this.check(await this.db.from(table).delete().eq("user_id", userId));
    }
  }
}
