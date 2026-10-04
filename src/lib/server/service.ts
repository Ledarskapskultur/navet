import "server-only";
import { randomUUID } from "node:crypto";
import { googleDueToISODate, isoDateToGoogleDue } from "../dates";
import { parseCapture } from "../parser";
import { PROJECT_COLORS } from "../labels";
import type { ItemPatch, NavetItem, NewItemInput, Project, SyncState } from "../types";
import { getTasksProvider } from "../integrations/google/provider";
import { MockTasksProvider } from "../integrations/google/mock-tasks";
import type { GoogleTask, GoogleTaskInput, TasksProvider } from "../integrations/google/types";
import type { RequestContext } from "./session";
import { getStore, type NavetStore } from "./store";
import { newItem, seedDemoItems, seedMockGoogle, seedProjects, seedWelcomeItems } from "./seed";

const SYNC_KEY = "google_sync_state";
const SEEDED_KEY = "seeded_v1";

export class NotFoundError extends Error {}

/** One instance per request. All writes to Google go through here. */
export class NavetService {
  /** null in personal mode – Navet then works entirely on its own */
  private provider: TasksProvider | null;

  private constructor(
    private ctx: RequestContext,
    private store: NavetStore,
  ) {
    this.provider = getTasksProvider(ctx, store);
  }

  static async create(ctx: RequestContext) {
    const svc = new NavetService(ctx, await getStore());
    await svc.ensureSeeded();
    return svc;
  }

  get userId() {
    return this.ctx.userId;
  }

  /** The Google Tasks backend; only called on paths that are guarded by `this.provider`. */
  private get google(): TasksProvider {
    if (!this.provider) throw new Error("Google Tasks är inte kopplat.");
    return this.provider;
  }

  get storageKind() {
    return this.store.kind;
  }

  private async ensureSeeded() {
    if (await this.store.getKV<boolean>(this.userId, SEEDED_KEY)) return;
    await this.store.insertProjects(this.userId, seedProjects());
    if (this.ctx.mode === "demo") {
      await this.store.insertItems(this.userId, seedDemoItems());
      await this.store.setKV(this.userId, MockTasksProvider.KEY, seedMockGoogle());
    } else {
      await this.store.insertItems(this.userId, seedWelcomeItems());
    }
    await this.store.setKV(this.userId, SEEDED_KEY, true);
  }

  async resetDemo() {
    if (this.ctx.mode !== "demo") throw new Error("Endast demoläget kan återställas.");
    await this.store.clearUser(this.userId);
    await this.ensureSeeded();
  }

  // ---------- Reads ----------

  listItems() {
    return this.store.listItems(this.userId);
  }

  listProjects() {
    return this.store.listProjects(this.userId);
  }

  async getSyncState(): Promise<SyncState> {
    return (
      (await this.store.getKV<SyncState>(this.userId, SYNC_KEY)) ?? {
        lastSyncAt: null,
        lastError: null,
        lists: [],
        defaultListId: null,
        imported: 0,
      }
    );
  }

  private async getItemOrThrow(id: string) {
    const item = await this.store.getItem(this.userId, id);
    if (!item) throw new NotFoundError("Objektet finns inte");
    return item;
  }

  // ---------- Items ----------

  async createItem(input: NewItemInput, opts: { syncToGoogle?: boolean; listId?: string | null } = {}) {
    let item = newItem({
      ...stripUndefined(input),
      title: input.title.trim(),
      status: input.status ?? "inbox",
      completedAt: input.status === "done" ? new Date().toISOString() : null,
      externalId: null,
      externalProvider: null,
      externalListId: null,
      externalUpdatedAt: null,
    });
    if (opts.syncToGoogle && this.provider) item = await this.pushNewToGoogle(item, opts.listId ?? null);
    await this.store.insertItems(this.userId, [item]);
    return item;
  }

  async updateItem(id: string, patch: ItemPatch, opts: { syncToGoogle?: boolean; listId?: string | null } = {}) {
    const before = await this.getItemOrThrow(id);
    const now = new Date().toISOString();
    let after: NavetItem = { ...before, ...stripUndefined(patch), id, updatedAt: now };

    if (after.status === "done" && before.status !== "done") after.completedAt = now;
    if (after.status !== "done") after.completedAt = null;

    // Never let the client rewrite link fields directly – only via list moves below.
    after.externalId = before.externalId;
    after.externalProvider = before.externalProvider;
    after.externalUpdatedAt = before.externalUpdatedAt;
    after.externalListId = before.externalListId;

    if (!this.provider) {
      // Personal mode: nothing to push.
    } else if (before.externalProvider === "google_tasks" && before.externalId && before.externalListId) {
      after = await this.pushUpdateToGoogle(before, after, patch.externalListId ?? opts.listId ?? null);
    } else if (opts.syncToGoogle) {
      after = await this.pushNewToGoogle(after, opts.listId ?? null);
    }

    await this.store.updateItem(this.userId, after);
    return after;
  }

  async deleteItem(id: string, opts: { deleteExternal?: boolean } = {}) {
    const item = await this.getItemOrThrow(id);
    if (this.provider && opts.deleteExternal !== false && item.externalProvider === "google_tasks" && item.externalId && item.externalListId) {
      await this.google.deleteTask(item.externalListId, item.externalId).catch((err) => {
        // Already deleted in Google is fine.
        if (!String(err?.message).includes("404")) throw err;
      });
    }
    await this.store.deleteItem(this.userId, id);
  }

  /** Detach an item from Google Tasks without deleting the Google task. */
  async unlinkItem(id: string) {
    const item = await this.getItemOrThrow(id);
    const after: NavetItem = {
      ...item,
      externalId: null,
      externalProvider: null,
      externalListId: null,
      externalUpdatedAt: null,
      updatedAt: new Date().toISOString(),
    };
    await this.store.updateItem(this.userId, after);
    return after;
  }

  private toGoogleInput(item: NavetItem): GoogleTaskInput {
    return {
      title: item.title,
      notes: item.description ?? null,
      due: isoDateToGoogleDue(item.dueDate),
      status: item.status === "done" ? "completed" : "needsAction",
    };
  }

  private async resolveListId(listId: string | null): Promise<string> {
    if (listId) return listId;
    const state = await this.getSyncState();
    if (state.defaultListId) return state.defaultListId;
    const lists = await this.google.listTaskLists();
    if (!lists.length) throw new Error("Hittade inga Google Tasks-listor.");
    return lists[0].id;
  }

  private async pushNewToGoogle(item: NavetItem, listId: string | null): Promise<NavetItem> {
    const target = await this.resolveListId(listId);
    const task = await this.google.insertTask(target, this.toGoogleInput(item));
    return {
      ...item,
      externalId: task.id,
      externalProvider: "google_tasks",
      externalListId: target,
      externalUpdatedAt: task.updated,
    };
  }

  private async pushUpdateToGoogle(before: NavetItem, after: NavetItem, targetListId: string | null) {
    let listId = before.externalListId!;
    let taskId = before.externalId!;
    let updated = before.externalUpdatedAt;

    if (targetListId && targetListId !== listId) {
      const moved = await this.google.moveTask(listId, taskId, targetListId);
      listId = targetListId;
      taskId = moved.id;
      updated = moved.updated;
    }

    const input: GoogleTaskInput = {};
    if (after.title !== before.title) input.title = after.title;
    if (after.description !== before.description) input.notes = after.description ?? null;
    if (after.dueDate !== before.dueDate) input.due = isoDateToGoogleDue(after.dueDate);
    if ((after.status === "done") !== (before.status === "done")) {
      input.status = after.status === "done" ? "completed" : "needsAction";
    }
    if (Object.keys(input).length) {
      const task = await this.google.patchTask(listId, taskId, input);
      updated = task.updated;
    }
    return { ...after, externalListId: listId, externalId: taskId, externalUpdatedAt: updated };
  }

  // ---------- Projects ----------

  async createProject(input: { name: string; description?: string | null; aliases?: string[] }) {
    const existing = await this.listProjects();
    const ts = new Date().toISOString();
    const project: Project = {
      id: `p-${randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      description: input.description ?? null,
      aliases: input.aliases ?? [],
      color: PROJECT_COLORS[existing.length % PROJECT_COLORS.length],
      archived: false,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.store.insertProjects(this.userId, [project]);
    return project;
  }

  async updateProject(id: string, patch: Partial<Project>) {
    const project = (await this.listProjects()).find((p) => p.id === id);
    if (!project) throw new NotFoundError("Projektet finns inte");
    const after = { ...project, ...stripUndefined(patch), id, updatedAt: new Date().toISOString() };
    await this.store.updateProject(this.userId, after);
    return after;
  }

  async deleteProject(id: string) {
    const items = await this.listItems();
    for (const item of items.filter((i) => i.projectId === id)) {
      await this.store.updateItem(this.userId, { ...item, projectId: null });
    }
    await this.store.deleteProject(this.userId, id);
  }

  // ---------- Google Tasks ----------

  async listGoogleLists() {
    return this.provider ? this.provider.listTaskLists() : [];
  }

  async setDefaultList(listId: string) {
    const state = await this.getSyncState();
    await this.store.setKV(this.userId, SYNC_KEY, { ...state, defaultListId: listId });
  }

  /**
   * Two-way reconciliation with Google Tasks.
   * - New Google tasks are imported into Navet's inbox (classified by the parser).
   * - Google-side changes (title, notes, due, completion, list) are applied when
   *   Google's `updated` differs from the value we stored at our last write.
   * - Navet-side edits are pushed immediately on save, so they don't need handling here.
   * - Tasks deleted in Google are archived in Navet and unlinked.
   */
  async syncGoogle(): Promise<{ state: SyncState; imported: number; updated: number; removed: number }> {
    const prev = await this.getSyncState();
    if (!this.provider) return { state: prev, imported: 0, updated: 0, removed: 0 };
    const provider = this.provider;
    try {
      const lists = await provider.listTaskLists();
      const projects = await this.listProjects();
      const items = await this.listItems();
      const linked = new Map(
        items.filter((i) => i.externalProvider === "google_tasks" && i.externalId).map((i) => [i.externalId!, i]),
      );
      const seen = new Set<string>();
      const toInsert: NavetItem[] = [];
      let updated = 0;
      const now = new Date();
      const recentCutoff = now.getTime() - 7 * 86400_000;

      for (const list of lists) {
        const tasks = await provider.listTasks(list.id);
        for (const task of tasks) {
          if (!task.title?.trim()) continue;
          seen.add(task.id);
          const item = linked.get(task.id);
          if (!item) {
            if (task.status === "completed" && (!task.completed || Date.parse(task.completed) < recentCutoff)) continue;
            toInsert.push(this.importTask(task, list.id, projects, now));
            continue;
          }
          if (item.externalUpdatedAt === task.updated && item.externalListId === list.id) continue;
          await this.store.updateItem(this.userId, this.applyGoogleChanges(item, task, list.id));
          updated++;
        }
      }

      let removed = 0;
      for (const [externalId, item] of linked) {
        if (seen.has(externalId) || item.status === "archived") continue;
        await this.store.updateItem(this.userId, {
          ...item,
          status: item.status === "done" ? "done" : "archived",
          externalId: null,
          externalProvider: null,
          externalListId: null,
          externalUpdatedAt: null,
          updatedAt: now.toISOString(),
        });
        removed++;
      }

      await this.store.insertItems(this.userId, toInsert);
      const state: SyncState = {
        lastSyncAt: now.toISOString(),
        lastError: null,
        lists,
        defaultListId: prev.defaultListId && lists.some((l) => l.id === prev.defaultListId) ? prev.defaultListId : (lists[0]?.id ?? null),
        imported: toInsert.length,
      };
      await this.store.setKV(this.userId, SYNC_KEY, state);
      return { state, imported: toInsert.length, updated, removed };
    } catch (err) {
      await this.store.setKV(this.userId, SYNC_KEY, { ...prev, lastError: (err as Error).message });
      throw err;
    }
  }

  private importTask(task: GoogleTask, listId: string, projects: Project[], now: Date): NavetItem {
    const parsed = parseCapture(task.title, projects, now);
    return newItem(
      {
        title: task.title.trim(),
        description: task.notes ?? null,
        type: parsed.type,
        status: task.status === "completed" ? "done" : parsed.type === "waiting" ? "waiting" : "inbox",
        source: "google_tasks",
        projectId: parsed.projectId,
        dueDate: googleDueToISODate(task.due),
        person: parsed.person,
        waitingFor: parsed.waitingFor,
        priority: parsed.priority,
        externalId: task.id,
        externalProvider: "google_tasks",
        externalListId: listId,
        externalUpdatedAt: task.updated,
        completedAt: task.status === "completed" ? (task.completed ?? now.toISOString()) : null,
      },
      now,
    );
  }

  private applyGoogleChanges(item: NavetItem, task: GoogleTask, listId: string): NavetItem {
    const done = task.status === "completed";
    let status = item.status;
    if (done) status = "done";
    else if (item.status === "done") status = "open";
    return {
      ...item,
      title: task.title.trim(),
      description: task.notes ?? null,
      dueDate: googleDueToISODate(task.due),
      // Google has no time – keep Navet's time only if the date is unchanged
      dueTime: googleDueToISODate(task.due) === item.dueDate ? item.dueTime : null,
      status,
      completedAt: done ? (task.completed ?? item.completedAt ?? new Date().toISOString()) : null,
      externalListId: listId,
      externalUpdatedAt: task.updated,
      updatedAt: new Date().toISOString(),
    };
  }

  /** Demo only: pretend the user said "Hey Google, påminn mig att …". */
  async simulateVoice(text: string) {
    if (!(this.provider instanceof MockTasksProvider)) throw new Error("Endast i demoläge.");
    const parsed = parseCapture(text, await this.listProjects());
    await this.provider.simulateVoiceTask(parsed.title, isoDateToGoogleDue(parsed.dueDate));
    return this.syncGoogle();
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
