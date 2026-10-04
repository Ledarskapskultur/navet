import type { GoogleTaskList } from "../../types";

/** Subset of the Google Tasks API "Task" resource that Navet uses. */
export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  /** RFC3339, only the date part is used by Google */
  due?: string;
  completed?: string;
  updated: string;
  parent?: string;
  deleted?: boolean;
  hidden?: boolean;
  webViewLink?: string;
}

export interface GoogleTaskInput {
  title?: string;
  notes?: string | null;
  status?: "needsAction" | "completed";
  due?: string | null;
}

/** Everything Navet needs from a Google Tasks backend – real API or mock. */
export interface TasksProvider {
  readonly kind: "google" | "mock";
  listTaskLists(): Promise<GoogleTaskList[]>;
  listTasks(listId: string): Promise<GoogleTask[]>;
  insertTask(listId: string, input: GoogleTaskInput): Promise<GoogleTask>;
  patchTask(listId: string, taskId: string, input: GoogleTaskInput): Promise<GoogleTask>;
  deleteTask(listId: string, taskId: string): Promise<void>;
  moveTask(listId: string, taskId: string, destinationListId: string): Promise<GoogleTask>;
}

export class GoogleAuthError extends Error {
  constructor(message = "Google-inloggningen har gått ut. Logga in igen.") {
    super(message);
  }
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
