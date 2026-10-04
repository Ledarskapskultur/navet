import "server-only";
import type { GoogleTaskList } from "../../types";
import { GoogleApiError, GoogleAuthError, type GoogleTask, type GoogleTaskInput, type TasksProvider } from "./types";

const BASE = "https://tasks.googleapis.com/tasks/v1";

/** Thin, dependency-free client for the Google Tasks REST API. */
export class GoogleTasksClient implements TasksProvider {
  readonly kind = "google" as const;

  constructor(private getAccessToken: () => Promise<string>) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
    });
    if (res.status === 401) throw new GoogleAuthError();
    if (!res.ok) {
      const text = await res.text();
      throw new GoogleApiError(`Google Tasks API ${res.status}: ${text.slice(0, 300)}`, res.status);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async listTaskLists(): Promise<GoogleTaskList[]> {
    const lists: GoogleTaskList[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ maxResults: "100" });
      if (pageToken) q.set("pageToken", pageToken);
      const res = await this.request<{ items?: GoogleTaskList[]; nextPageToken?: string }>(`/users/@me/lists?${q}`);
      lists.push(...(res.items ?? []).map((l) => ({ id: l.id, title: l.title, updated: l.updated })));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return lists;
  }

  async listTasks(listId: string): Promise<GoogleTask[]> {
    const tasks: GoogleTask[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ maxResults: "100", showCompleted: "true", showHidden: "true" });
      if (pageToken) q.set("pageToken", pageToken);
      const res = await this.request<{ items?: GoogleTask[]; nextPageToken?: string }>(
        `/lists/${encodeURIComponent(listId)}/tasks?${q}`,
      );
      tasks.push(...(res.items ?? []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return tasks.filter((t) => !t.deleted);
  }

  insertTask(listId: string, input: GoogleTaskInput) {
    return this.request<GoogleTask>(`/lists/${encodeURIComponent(listId)}/tasks`, {
      method: "POST",
      body: JSON.stringify(clean(input)),
    });
  }

  patchTask(listId: string, taskId: string, input: GoogleTaskInput) {
    const body: Record<string, unknown> = clean(input);
    // Re-opening a task requires clearing the completed timestamp.
    if (input.status === "needsAction") body.completed = null;
    return this.request<GoogleTask>(`/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  deleteTask(listId: string, taskId: string) {
    return this.request<void>(`/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
    });
  }

  async moveTask(listId: string, taskId: string, destinationListId: string): Promise<GoogleTask> {
    try {
      const q = new URLSearchParams({ destinationTasklist: destinationListId });
      return await this.request<GoogleTask>(
        `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}/move?${q}`,
        { method: "POST" },
      );
    } catch (err) {
      if (err instanceof GoogleAuthError) throw err;
      // Fallback for API versions without cross-list move: copy + delete.
      const original = await this.request<GoogleTask>(
        `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
      );
      const copy = await this.insertTask(destinationListId, {
        title: original.title,
        notes: original.notes,
        due: original.due,
        status: original.status,
      });
      await this.deleteTask(listId, taskId);
      return copy;
    }
  }
}

function clean(input: GoogleTaskInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) out[k] = v;
  return out;
}
