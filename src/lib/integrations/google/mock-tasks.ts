import "server-only";
import { randomUUID } from "node:crypto";
import type { GoogleTaskList } from "../../types";
import type { NavetStore } from "../../server/store";
import type { GoogleTask, GoogleTaskInput, TasksProvider } from "./types";

export interface MockGoogleData {
  lists: GoogleTaskList[];
  tasks: Record<string, GoogleTask[]>;
}

const KEY = "mock_google_tasks";

/**
 * In-app imitation of Google Tasks used in demo mode (no credentials).
 * Behaves like the real API so the whole sync flow can be tried out.
 */
export class MockTasksProvider implements TasksProvider {
  readonly kind = "mock" as const;

  constructor(
    private store: NavetStore,
    private userId: string,
  ) {}

  private async data(): Promise<MockGoogleData> {
    return (await this.store.getKV<MockGoogleData>(this.userId, KEY)) ?? { lists: [], tasks: {} };
  }

  private save(d: MockGoogleData) {
    return this.store.setKV(this.userId, KEY, d);
  }

  async listTaskLists() {
    return (await this.data()).lists;
  }

  async listTasks(listId: string) {
    return (await this.data()).tasks[listId] ?? [];
  }

  async insertTask(listId: string, input: GoogleTaskInput) {
    const d = await this.data();
    const now = new Date().toISOString();
    const task: GoogleTask = {
      id: `mock-${randomUUID().slice(0, 8)}`,
      title: input.title ?? "",
      notes: input.notes ?? undefined,
      status: input.status ?? "needsAction",
      due: input.due ?? undefined,
      completed: input.status === "completed" ? now : undefined,
      updated: now,
    };
    (d.tasks[listId] ??= []).unshift(task);
    await this.save(d);
    return task;
  }

  async patchTask(listId: string, taskId: string, input: GoogleTaskInput) {
    const d = await this.data();
    const task = d.tasks[listId]?.find((t) => t.id === taskId);
    if (!task) throw new Error("Uppgiften finns inte i Google Tasks (demo)");
    const now = new Date().toISOString();
    if (input.title !== undefined) task.title = input.title;
    if (input.notes !== undefined) task.notes = input.notes ?? undefined;
    if (input.due !== undefined) task.due = input.due ?? undefined;
    if (input.status !== undefined) {
      task.status = input.status;
      task.completed = input.status === "completed" ? now : undefined;
    }
    task.updated = now;
    await this.save(d);
    return { ...task };
  }

  async deleteTask(listId: string, taskId: string) {
    const d = await this.data();
    d.tasks[listId] = (d.tasks[listId] ?? []).filter((t) => t.id !== taskId);
    await this.save(d);
  }

  async moveTask(listId: string, taskId: string, destinationListId: string) {
    const d = await this.data();
    const task = d.tasks[listId]?.find((t) => t.id === taskId);
    if (!task) throw new Error("Uppgiften finns inte i Google Tasks (demo)");
    d.tasks[listId] = d.tasks[listId].filter((t) => t.id !== taskId);
    task.updated = new Date().toISOString();
    (d.tasks[destinationListId] ??= []).unshift(task);
    await this.save(d);
    return { ...task };
  }

  /** Demo helper: simulate "Hey Google, påminn mig att …" creating a task. */
  async simulateVoiceTask(title: string, due: string | null) {
    const d = await this.data();
    const listId = d.lists[0]?.id;
    if (!listId) throw new Error("Inga listor i demo-Google Tasks");
    return this.insertTask(listId, { title, due });
  }

  static KEY = KEY;
}
