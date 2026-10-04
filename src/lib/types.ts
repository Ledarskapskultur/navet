// Navet's domain model. Navet is the system of record; Google Tasks and
// Outlook are integration sources that map onto these types.

export const ITEM_TYPES = ["task", "idea", "commitment", "note", "waiting", "reminder", "request"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_STATUSES = ["inbox", "open", "waiting", "done", "archived"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_SOURCES = ["manual", "voice", "google_tasks", "outlook_mail", "outlook_calendar", "web_form"] as const;
export type ItemSource = (typeof ITEM_SOURCES)[number];

export const PRIORITIES = ["low", "normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type ExternalProvider = "google_tasks" | "outlook";

/** Where a booking request (type = request) is in its lifecycle. */
export const REQUEST_STAGES = ["new", "answered", "booked", "declined"] as const;
export type RequestStage = (typeof REQUEST_STAGES)[number];

/** Who a booking request is from. */
export interface Contact {
  name: string | null;
  email: string | null;
  phone: string | null;
  organization: string | null;
}

export interface NavetItem {
  id: string;
  title: string;
  description: string | null;
  type: ItemType;
  status: ItemStatus;
  source: ItemSource;
  projectId: string | null;
  /** YYYY-MM-DD (local date) */
  dueDate: string | null;
  /** HH:mm – Navet only, Google Tasks does not store time */
  dueTime: string | null;
  priority: Priority;
  /** Estimated time in minutes */
  estimatedTime: number | null;
  /** Who/what we are waiting for (type = waiting) */
  waitingFor: string | null;
  /** Person the item concerns, e.g. who a commitment was made to */
  person: string | null;
  /** Last follow-up date for waiting items (YYYY-MM-DD) */
  lastFollowUp: string | null;
  /** Booking requests: lifecycle stage */
  stage: RequestStage | null;
  /** Booking requests: the customer */
  contact: Contact | null;
  /** Booking requests: requested date for the course/event (YYYY-MM-DD) */
  eventDate: string | null;
  /** Booking requests: which landing page / form it came from */
  origin: string | null;
  externalId: string | null;
  externalProvider: ExternalProvider | null;
  /** Google Tasks list id when linked */
  externalListId: string | null;
  /** The provider's own "updated" timestamp from the last time we were in sync */
  externalUpdatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewItemInput = Partial<Omit<NavetItem, "id" | "createdAt" | "updatedAt">> & {
  title: string;
};

export type ItemPatch = Partial<Omit<NavetItem, "id" | "createdAt">>;

export interface Project {
  id: string;
  name: string;
  description: string | null;
  /** Short keywords used by the capture parser, e.g. ["ugl"] */
  aliases: string[];
  color: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface SyncState {
  lastSyncAt: string | null;
  lastError: string | null;
  lists: GoogleTaskList[];
  defaultListId: string | null;
  imported: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  location?: string;
  attendees?: string[];
  source: "demo" | "outlook_calendar";
}

export interface FlaggedMail {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  preview: string;
  receivedAt: string;
  source: "demo" | "outlook_mail";
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AppStatus {
  /** personal = Navet on its own (default), google = logged in with Google Tasks sync, demo = sample data */
  mode: "personal" | "google" | "demo";
  user: SessionUser | null;
  /** True when Google Tasks (real or simulated) is available in this mode */
  googleEnabled: boolean;
  passwordProtected: boolean;
  googleConfigured: boolean;
  outlookConfigured: boolean;
  storage: "supabase" | "file";
  /** False when data lives in a temporary folder (file storage on Vercel) and may disappear */
  storageDurable: boolean;
}
