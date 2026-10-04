import "server-only";
import type { NavetItem, Project } from "../types";
import { supabaseConfigured } from "./env";

/**
 * Storage abstraction. Two implementations:
 *  - FileStore: JSON file on disk, zero configuration (local development / demo)
 *  - SupabaseStore: Postgres via Supabase (production)
 */
export interface NavetStore {
  readonly kind: "file" | "supabase";
  listItems(userId: string): Promise<NavetItem[]>;
  getItem(userId: string, id: string): Promise<NavetItem | null>;
  insertItems(userId: string, items: NavetItem[]): Promise<void>;
  updateItem(userId: string, item: NavetItem): Promise<void>;
  deleteItem(userId: string, id: string): Promise<void>;
  listProjects(userId: string): Promise<Project[]>;
  insertProjects(userId: string, projects: Project[]): Promise<void>;
  updateProject(userId: string, project: Project): Promise<void>;
  deleteProject(userId: string, id: string): Promise<void>;
  getKV<T>(userId: string, key: string): Promise<T | null>;
  setKV<T>(userId: string, key: string, value: T): Promise<void>;
  clearUser(userId: string): Promise<void>;
}

let instance: Promise<NavetStore> | null = null;

export function getStore(): Promise<NavetStore> {
  if (!instance) {
    instance = supabaseConfigured()
      ? import("./supabase-store").then((m) => new m.SupabaseStore())
      : import("./file-store").then((m) => new m.FileStore());
  }
  return instance;
}
