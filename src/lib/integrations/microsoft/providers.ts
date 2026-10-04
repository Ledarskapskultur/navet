import "server-only";
import type { CalendarEvent, FlaggedMail } from "../../types";
import type { NavetStore } from "../../server/store";
import { outlookConfigured } from "../../server/env";
import { loadMsConnection, msAccessToken } from "./connection";
import { graphCalendarView, graphFlaggedMail } from "./graph";

export interface CalendarProvider {
  readonly kind: "demo" | "outlook";
  /** tzOffset: minutes as returned by Date#getTimezoneOffset() in the browser */
  listEvents(from: Date, to: Date, tzOffset?: number): Promise<CalendarEvent[]>;
}

export interface MailProvider {
  readonly kind: "demo" | "outlook";
  listFlagged(): Promise<FlaggedMail[]>;
}

const DAY = 86400_000;

/** Demo calendar until Microsoft Graph is connected. Generates a believable week. */
export class DemoCalendarProvider implements CalendarProvider {
  readonly kind = "demo" as const;

  async listEvents(from: Date, to: Date, tzOffset = 0) {
    const events: CalendarEvent[] = [];
    // Work in the viewer's local calendar regardless of server time zone.
    const localMs = (t: number) => t - tzOffset * 60_000;
    const firstLocalMidnight = Math.floor(localMs(from.getTime()) / DAY) * DAY;
    for (let day = firstLocalMidnight; day < localMs(to.getTime()); day += DAY) {
      const local = new Date(day);
      const dow = local.getUTCDay();
      const key = local.toISOString().slice(0, 10);
      const d = day;
      const at = (dayMs: number, h: number, m = 0) => new Date(dayMs + (h * 60 + m + tzOffset) * 60_000).toISOString();
      if (dow === 6) {
        events.push({ id: `${key}-s1`, title: "Träning", start: at(d, 9, 30), end: at(d, 10, 30), source: "demo" });
        events.push({ id: `${key}-s2`, title: "Middag hos vänner", start: at(d, 18), end: at(d, 21), source: "demo" });
      }
      if (dow === 0) {
        events.push({ id: `${key}-s3`, title: "Promenad", start: at(d, 10), end: at(d, 11), source: "demo" });
        events.push({ id: `${key}-s4`, title: "Planera veckan", start: at(d, 19), end: at(d, 19, 30), source: "demo" });
      }
      if (dow === 1) {
        events.push({ id: `${key}-1`, title: "Veckoplanering", start: at(d, 8, 30), end: at(d, 9), source: "demo" });
        events.push({ id: `${key}-2`, title: "UGL – handledarmöte", start: at(d, 13), end: at(d, 14, 30), location: "Teams", attendees: ["Martin", "Lisa"], source: "demo" });
      }
      if (dow === 2) {
        events.push({ id: `${key}-3`, title: "Lektion: Ledarskap & kommunikation", start: at(d, 9), end: at(d, 12), location: "YH, sal 3", source: "demo" });
        events.push({ id: `${key}-4`, title: "Kundsamtal – offert", start: at(d, 15), end: at(d, 15, 45), attendees: ["Anna Andersson"], source: "demo" });
      }
      if (dow === 3) {
        events.push({ id: `${key}-5`, title: "Ledarskapsmetoden – workshop", start: at(d, 10), end: at(d, 12), location: "Kontoret", source: "demo" });
        events.push({ id: `${key}-6`, title: "Lunch med Johan", start: at(d, 12, 15), end: at(d, 13, 15), source: "demo" });
      }
      if (dow === 4) {
        events.push({ id: `${key}-7`, title: "Avstämning ekonomi", start: at(d, 9), end: at(d, 9, 30), source: "demo" });
        events.push({ id: `${key}-8`, title: "YH – handledning studenter", start: at(d, 13), end: at(d, 15), location: "Zoom", source: "demo" });
      }
      if (dow === 5) {
        events.push({ id: `${key}-9`, title: "Fokustid – skriva", start: at(d, 8), end: at(d, 10), source: "demo" });
        events.push({ id: `${key}-10`, title: "Veckoavslut", start: at(d, 15), end: at(d, 15, 30), source: "demo" });
      }
    }
    return events;
  }
}

export class DemoMailProvider implements MailProvider {
  readonly kind = "demo" as const;

  async listFlagged(): Promise<FlaggedMail[]> {
    const now = Date.now();
    const h = (n: number) => new Date(now - n * 3600_000).toISOString();
    return [
      {
        id: "mail-1",
        from: "Anna Andersson",
        fromEmail: "anna.andersson@exempel.se",
        subject: "Kan du skicka offert senast fredag?",
        preview: "Hej! Vi vill gärna gå vidare med UGL för vår ledningsgrupp. Kan du skicka en offert senast fredag?",
        receivedAt: h(3),
        source: "demo",
      },
      {
        id: "mail-2",
        from: "Martin Berg",
        fromEmail: "martin.berg@exempel.se",
        subject: "Presentationen till tisdag",
        preview: "Tack för senast! Du nämnde att du skulle skicka presentationen innan tisdag – går det fortfarande bra?",
        receivedAt: h(20),
        source: "demo",
      },
      {
        id: "mail-3",
        from: "Lisa Holm",
        fromEmail: "lisa.holm@yh-exempel.se",
        subject: "Betyg för kursen Ledarskap 1",
        preview: "Påminnelse: betygen för Ledarskap 1 behöver rapporteras in senast den 15 oktober.",
        receivedAt: h(28),
        source: "demo",
      },
      {
        id: "mail-4",
        from: "Johan Ek",
        fromEmail: "johan.ek@exempel.se",
        subject: "Idé: digital uppföljning efter UGL",
        preview: "Jag funderade på om man kunde ha en digital uppföljning tre månader efter kursveckan. Vad tror du?",
        receivedAt: h(50),
        source: "demo",
      },
    ];
  }
}

class OutlookCalendarProvider implements CalendarProvider {
  readonly kind = "outlook" as const;
  constructor(private store: NavetStore) {}
  async listEvents(from: Date, to: Date) {
    return graphCalendarView(await msAccessToken(this.store), from, to);
  }
}

class OutlookMailProvider implements MailProvider {
  readonly kind = "outlook" as const;
  constructor(private store: NavetStore) {}
  async listFlagged() {
    return graphFlaggedMail(await msAccessToken(this.store));
  }
}

/** Outlook when connected, otherwise demo data. */
export async function getCalendarProvider(store: NavetStore): Promise<CalendarProvider> {
  return outlookConfigured() && (await loadMsConnection(store)) ? new OutlookCalendarProvider(store) : new DemoCalendarProvider();
}

export async function getMailProvider(store: NavetStore): Promise<MailProvider> {
  return outlookConfigured() && (await loadMsConnection(store)) ? new OutlookMailProvider(store) : new DemoMailProvider();
}
