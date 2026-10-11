// Calendar helpers shared by the start page and the calendar page. Everything works in the
// viewer's own calendar days (YYYY-MM-DD), so events are placed correctly in any time zone.
import { parseISO } from "date-fns";
import { addDaysISO, formatDue, formatTime, toISODate } from "./dates";
import type { CalendarEvent } from "./types";

/** First and last calendar day (inclusive) an event covers. A course week covers five days. */
export function eventDays(e: CalendarEvent): { first: string; last: string } {
  if (e.allDay) {
    // All-day events are stored as whole dates, with the end date being the day after the last.
    const first = e.start.slice(0, 10);
    const endExclusive = e.end.slice(0, 10);
    return { first, last: endExclusive > first ? addDaysISO(endExclusive, -1) : first };
  }
  const start = new Date(e.start);
  const end = new Date(e.end);
  // An event ending exactly at midnight does not spill into the next day.
  const lastMoment = end > start ? new Date(end.getTime() - 1) : start;
  return { first: toISODate(start), last: toISODate(lastMoment) };
}

export function occursOn(e: CalendarEvent, day: string): boolean {
  const { first, last } = eventDays(e);
  return first <= day && day <= last;
}

/** When an event starts, as a moment: all-day events start at midnight on their first day. */
const startMoment = (e: CalendarEvent) => (e.allDay ? parseISO(eventDays(e).first) : new Date(e.start));

/** All-day first, then by start time. */
export function byStart(a: CalendarEvent, b: CalendarEvent): number {
  return Number(!!b.allDay) - Number(!!a.allDay) || startMoment(a).getTime() - startMoment(b).getTime();
}

/**
 * The next thing in the calendar: a meeting that is going on or the next to start. All-day
 * events count from tomorrow on (today's are shown in the agenda, they are not "next").
 */
export function nextMeeting(events: CalendarEvent[] | null, now = new Date()): CalendarEvent | null {
  const today = toISODate(now);
  return (
    (events ?? [])
      .filter((e) => (e.allDay ? eventDays(e).first > today : new Date(e.end) > now))
      .sort((a, b) => startMoment(a).getTime() - startMoment(b).getTime())[0] ?? null
  );
}

/** "09:00–10:30", "Heldag", or for events spanning several days "forts. · t.o.m. Fredag 16:00". */
export function eventTimeLabel(e: CalendarEvent, day: string): string {
  const { first, last } = eventDays(e);
  const until = last > day ? ` · t.o.m. ${formatDue(last).toLowerCase()}` : "";
  if (e.allDay) return `Heldag${until}`;
  const from = first < day ? "forts." : formatTime(e.start);
  if (last > day) return `${from}${until} ${formatTime(e.end)}`;
  return first < day ? `forts. till ${formatTime(e.end)}` : `${from}–${formatTime(e.end)}`;
}

/** Short text for the time column: "09:00", "Hel" (all day) or "forts." (started an earlier day). */
export function eventStartLabel(e: CalendarEvent, day: string): string {
  if (e.allDay) return "Hel";
  return eventDays(e).first < day ? "forts." : formatTime(e.start);
}

/** "Anna Andersson, Martin Berg +3" */
export function attendeeSummary(e: CalendarEvent, max = 3): string | null {
  const names = (e.attendees ?? []).filter(Boolean);
  if (!names.length) return null;
  return names.length > max ? `${names.slice(0, max).join(", ")} +${names.length - max}` : names.join(", ");
}
