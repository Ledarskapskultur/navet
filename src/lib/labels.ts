import type { ItemSource, ItemStatus, ItemType, Priority, RequestStage } from "./types";

export const TYPE_LABEL: Record<ItemType, string> = {
  task: "Uppgift",
  idea: "Idé",
  commitment: "Åtagande",
  note: "Anteckning",
  waiting: "Väntar på",
  reminder: "Påminnelse",
  request: "Förfrågan",
};

export const STAGE_LABEL: Record<RequestStage, string> = {
  new: "Ny",
  answered: "Besvarad",
  booked: "Bokad",
  declined: "Avböjd",
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  inbox: "Inkorg",
  open: "Aktiv",
  waiting: "Väntar",
  done: "Klar",
  archived: "Arkiverad",
};

export const SOURCE_LABEL: Record<ItemSource, string> = {
  manual: "Navet",
  voice: "Röst",
  google_tasks: "Via Google Tasks",
  outlook_mail: "Outlook-mail",
  outlook_calendar: "Outlook-kalender",
  web_form: "Webbformulär",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Låg",
  normal: "Normal",
  high: "Hög",
};

export const PROJECT_COLORS = ["#2F5D4E", "#7A6A4F", "#4F6A7A", "#8A5A5A", "#5E5A7A", "#6B7A4F"];
