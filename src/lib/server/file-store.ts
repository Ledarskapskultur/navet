import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { NavetItem, Project } from "../types";
import type { NavetStore } from "./store";
import { env } from "./env";

interface UserData {
  items: Record<string, NavetItem>;
  projects: Record<string, Project>;
  kv: Record<string, unknown>;
}

interface FileData {
  version: 1;
  users: Record<string, UserData>;
}

function dataFile(): string {
  const dir =
    env.dataDir ?? (process.env.VERCEL ? path.join(os.tmpdir(), "navet-data") : path.join(process.cwd(), ".navet-data"));
  return path.join(dir, "store.json");
}

/** Simple JSON-file store. Writes are serialised through a promise chain. */
export class FileStore implements NavetStore {
  readonly kind = "file" as const;
  private cache: FileData | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  private async load(): Promise<FileData> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(dataFile(), "utf8")) as FileData;
    } catch {
      this.cache = { version: 1, users: {} };
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const file = dataFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.cache, null, 2));
    await fs.rename(tmp, file);
  }

  private async user(userId: string): Promise<UserData> {
    const data = await this.load();
    return (data.users[userId] ??= { items: {}, projects: {}, kv: {} });
  }

  private write<T>(fn: (u: UserData, data: FileData) => T, userId: string): Promise<T> {
    const run = this.chain.then(async () => {
      const u = await this.user(userId);
      const result = fn(u, this.cache!);
      await this.persist();
      return result;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  async listItems(userId: string) {
    return Object.values((await this.user(userId)).items).map((i) => ({ ...i }));
  }
  async getItem(userId: string, id: string) {
    const i = (await this.user(userId)).items[id];
    return i ? { ...i } : null;
  }
  insertItems(userId: string, items: NavetItem[]) {
    return this.write((u) => items.forEach((i) => (u.items[i.id] = i)), userId);
  }
  updateItem(userId: string, item: NavetItem) {
    return this.write((u) => void (u.items[item.id] = item), userId);
  }
  deleteItem(userId: string, id: string) {
    return this.write((u) => void delete u.items[id], userId);
  }
  async listProjects(userId: string) {
    return Object.values((await this.user(userId)).projects).map((p) => ({ ...p }));
  }
  insertProjects(userId: string, projects: Project[]) {
    return this.write((u) => projects.forEach((p) => (u.projects[p.id] = p)), userId);
  }
  updateProject(userId: string, project: Project) {
    return this.write((u) => void (u.projects[project.id] = project), userId);
  }
  deleteProject(userId: string, id: string) {
    return this.write((u) => void delete u.projects[id], userId);
  }
  async getKV<T>(userId: string, key: string) {
    const v = (await this.user(userId)).kv[key];
    return v === undefined ? null : (structuredClone(v) as T);
  }
  setKV<T>(userId: string, key: string, value: T) {
    return this.write((u) => void (u.kv[key] = value), userId);
  }
  clearUser(userId: string) {
    return this.write((_u, data) => void delete data.users[userId], userId);
  }
}
