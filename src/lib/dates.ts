import { addDays, format, parseISO, differenceInCalendarDays } from "date-fns";
import { sv } from "date-fns/locale";

/** Local calendar date as YYYY-MM-DD. */
export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function addDaysISO(iso: string, days: number): string {
  return toISODate(addDays(parseISO(iso), days));
}

export function daysFromToday(iso: string, now: Date = new Date()): number {
  return differenceInCalendarDays(parseISO(iso), now);
}

/** Human Swedish label for a due date: "Idag", "Imorgon", "Igår", "tors 9 okt". */
export function formatDue(iso: string | null, time?: string | null, now: Date = new Date()): string {
  if (!iso) return "Inget datum";
  const diff = daysFromToday(iso, now);
  let label: string;
  if (diff === 0) label = "Idag";
  else if (diff === 1) label = "Imorgon";
  else if (diff === -1) label = "Igår";
  else if (diff > 1 && diff < 7) label = format(parseISO(iso), "EEEE", { locale: sv });
  else label = format(parseISO(iso), "EEE d MMM", { locale: sv });
  label = label.charAt(0).toUpperCase() + label.slice(1);
  return time ? `${label} ${time}` : label;
}

export function formatLongDate(d: Date = new Date()): string {
  const s = format(d, "EEEE d MMMM", { locale: sv });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatTime(iso: string): string {
  return format(parseISO(iso), "HH:mm");
}

export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "aldrig";
  const secs = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return "nyss";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `för ${mins} ${mins === 1 ? "minut" : "minuter"} sedan`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `för ${hours} ${hours === 1 ? "timme" : "timmar"} sedan`;
  const days = Math.round(hours / 24);
  return `för ${days} ${days === 1 ? "dag" : "dagar"} sedan`;
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "God natt";
  if (h < 10) return "God morgon";
  if (h < 17) return "God dag";
  return "God kväll";
}

/** Google Tasks stores due as RFC3339 but only the date part is meaningful. */
export function googleDueToISODate(due: string | undefined | null): string | null {
  return due ? due.slice(0, 10) : null;
}

export function isoDateToGoogleDue(iso: string | null): string | null {
  return iso ? `${iso}T00:00:00.000Z` : null;
}
