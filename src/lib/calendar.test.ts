import { describe, expect, it } from "vitest";
import { attendeeSummary, eventDays, eventTimeLabel, nextMeeting, occursOn } from "./calendar";
import type { CalendarEvent } from "./types";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({ id: "e", title: "Möte", start: "", end: "", source: "outlook_calendar", ...over });
// Local-time helpers so the tests hold in any time zone.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe("kalenderdagar", () => {
  it("en heldagshändelse över en kursvecka täcker alla fem dagar", () => {
    const course = ev({ allDay: true, start: "2026-10-12T00:00:00.0000000Z", end: "2026-10-17T00:00:00.0000000Z" });
    expect(eventDays(course)).toEqual({ first: "2026-10-12", last: "2026-10-16" });
    expect(["2026-10-11", "2026-10-12", "2026-10-14", "2026-10-16", "2026-10-17"].map((d) => occursOn(course, d))).toEqual([false, true, true, true, false]);
  });

  it("en vanlig heldag täcker bara sin dag", () => {
    expect(eventDays(ev({ allDay: true, start: "2026-10-12T00:00:00Z", end: "2026-10-13T00:00:00Z" }))).toEqual({ first: "2026-10-12", last: "2026-10-12" });
  });

  it("ett möte över flera dagar syns alla dagarna, men inte dagen det slutar vid midnatt", () => {
    const multi = ev({ start: at(2026, 10, 12, 9), end: at(2026, 10, 14, 16) });
    expect(occursOn(multi, "2026-10-13")).toBe(true);
    expect(occursOn(multi, "2026-10-14")).toBe(true);
    expect(occursOn(multi, "2026-10-15")).toBe(false);
    const toMidnight = ev({ start: at(2026, 10, 12, 20), end: at(2026, 10, 13, 0) });
    expect(eventDays(toMidnight).last).toBe("2026-10-12");
  });

  it("beskriver tiden för fortsättningsdagar", () => {
    const multi = ev({ start: at(2026, 10, 12, 9), end: at(2026, 10, 14, 16) });
    expect(eventTimeLabel(multi, "2026-10-14")).toBe("forts. till 16:00");
    expect(eventTimeLabel(multi, "2026-10-13")).toMatch(/^forts\. · t\.o\.m\. .* 16:00$/);
    expect(eventTimeLabel(ev({ start: at(2026, 10, 12, 9), end: at(2026, 10, 12, 10, 30) }), "2026-10-12")).toBe("09:00–10:30");
  });
});

describe("nästa möte", () => {
  const now = new Date(2026, 9, 12, 10, 0);
  it("väljer pågående möte före kommande, och hoppar över avslutade", () => {
    const done = ev({ id: "done", start: at(2026, 10, 12, 8), end: at(2026, 10, 12, 9) });
    const ongoing = ev({ id: "now", start: at(2026, 10, 12, 9, 30), end: at(2026, 10, 12, 10, 30) });
    const later = ev({ id: "later", start: at(2026, 10, 12, 13), end: at(2026, 10, 12, 14) });
    expect(nextMeeting([later, done, ongoing], now)?.id).toBe("now");
    expect(nextMeeting([later, done], now)?.id).toBe("later");
    expect(nextMeeting([done], now)).toBeNull();
    expect(nextMeeting(null, now)).toBeNull();
  });

  it("dagens heldag är inte nästa möte, men en kommande kursvecka är det", () => {
    const today = ev({ id: "today", allDay: true, start: "2026-10-12T00:00:00Z", end: "2026-10-13T00:00:00Z" });
    const course = ev({ id: "course", allDay: true, start: "2026-10-19T00:00:00Z", end: "2026-10-24T00:00:00Z" });
    expect(nextMeeting([today], now)).toBeNull();
    expect(nextMeeting([today, course], now)?.id).toBe("course");
  });
});

describe("deltagare", () => {
  it("kortar ner långa listor", () => {
    expect(attendeeSummary(ev({ attendees: ["A", "B", "C", "D", "E"] }))).toBe("A, B, C +2");
    expect(attendeeSummary(ev({ attendees: ["A"] }))).toBe("A");
    expect(attendeeSummary(ev({}))).toBeNull();
  });
});
