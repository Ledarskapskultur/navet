import "server-only";
import type { CalendarEvent, MailMessage, MailSummary, RemoteProviderKind } from "../../types";
import type { NavetStore } from "../../server/store";
import { env, integrationsUnlocked, outlookConfigured, sessionSecretOk } from "../../server/env";
import type { IntegrationState } from "../types";
import { loadMsConnection, loadMsHealth, msAccessToken, recordMsResult, type MsConnection, type MsHealth } from "./connection";
import { GraphAuthError, graphCalendarView, graphFlaggedMail, graphMailSummary } from "./graph";
import type { MsFeature } from "./scopes";

export interface CalendarProvider {
  readonly kind: RemoteProviderKind;
  readonly state: IntegrationState;
  /** tzOffset: minutes as returned by Date#getTimezoneOffset() in the browser */
  listEvents(from: Date, to: Date, tzOffset?: number): Promise<CalendarEvent[]>;
}

export interface MailProvider {
  readonly kind: RemoteProviderKind;
  readonly state: IntegrationState;
  listFlagged(): Promise<MailMessage[]>;
  summary(): Promise<MailSummary>;
}

const DAY = 86400_000;

/** Sample calendar, only used in demo mode (NAVET_DEMO=1). Generates a believable week. */
export class DemoCalendarProvider implements CalendarProvider {
  readonly kind = "demo" as const;
  readonly state = "connected" as const;

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

/** Sample mail, only used in demo mode (NAVET_DEMO=1). */
export class DemoMailProvider implements MailProvider {
  readonly kind = "demo" as const;
  readonly state = "connected" as const;

  async listFlagged(): Promise<MailMessage[]> {
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
        isRead: false,
        flagged: true,
        importance: "high",
        source: "demo",
      },
      {
        id: "mail-2",
        from: "Martin Berg",
        fromEmail: "martin.berg@exempel.se",
        subject: "Presentationen till tisdag",
        preview: "Tack för senast! Du nämnde att du skulle skicka presentationen innan tisdag – går det fortfarande bra?",
        receivedAt: h(20),
        isRead: true,
        flagged: true,
        source: "demo",
      },
      {
        id: "mail-3",
        from: "Lisa Holm",
        fromEmail: "lisa.holm@yh-exempel.se",
        subject: "Betyg för kursen Ledarskap 1",
        preview: "Påminnelse: betygen för Ledarskap 1 behöver rapporteras in senast den 15 oktober.",
        receivedAt: h(28),
        isRead: true,
        flagged: true,
        source: "demo",
      },
      {
        id: "mail-4",
        from: "Johan Ek",
        fromEmail: "johan.ek@exempel.se",
        subject: "Idé: digital uppföljning efter UGL",
        preview: "Jag funderade på om man kunde ha en digital uppföljning tre månader efter kursveckan. Vad tror du?",
        receivedAt: h(50),
        isRead: true,
        flagged: true,
        source: "demo",
      },
    ];
  }

  async summary(): Promise<MailSummary> {
    const flagged = await this.listFlagged();
    return {
      unreadCount: flagged.filter((m) => !m.isRead).length,
      flaggedCount: flagged.length,
      flaggedMore: false,
      important: flagged.filter((m) => m.importance === "high"),
      flagged,
      latest: flagged,
    };
  }
}

const EMPTY_SUMMARY: MailSummary = { unreadCount: null, flaggedCount: null, flaggedMore: false, important: [], flagged: [], latest: [] };

/** Nothing is connected: return nothing. Navet never shows made-up data as if it were real. */
class NoCalendarProvider implements CalendarProvider {
  readonly kind = "none" as const;
  constructor(readonly state: IntegrationState) {}
  async listEvents() {
    return [];
  }
}

class NoMailProvider implements MailProvider {
  readonly kind = "none" as const;
  constructor(readonly state: IntegrationState) {}
  async listFlagged() {
    return [];
  }
  async summary() {
    return EMPTY_SUMMARY;
  }
}

/**
 * Runs a Graph call for a feature and remembers how it went ("senaste synkronisering" / last
 * error). If Graph rejects the token, one fresh token is tried before the connection is
 * marked as needing a new sign-in – a single stray 401 must not disconnect anything.
 */
async function tracked<T>(store: NavetStore, feature: MsFeature, call: (token: string) => Promise<T>): Promise<T> {
  try {
    const token = await msAccessToken(store, feature);
    let result: T;
    try {
      result = await call(token);
    } catch (err) {
      if (!(err instanceof GraphAuthError)) throw err;
      result = await call(await msAccessToken(store, feature, { force: true }));
    }
    await recordMsResult(store, feature, null);
    return result;
  } catch (err) {
    await recordMsResult(store, feature, err);
    throw err;
  }
}

class OutlookCalendarProvider implements CalendarProvider {
  readonly kind = "outlook" as const;
  constructor(
    private store: NavetStore,
    readonly state: IntegrationState,
  ) {}
  listEvents(from: Date, to: Date) {
    return tracked(this.store, "calendar", (token) => graphCalendarView(token, from, to));
  }
}

class OutlookMailProvider implements MailProvider {
  readonly kind = "outlook" as const;
  constructor(
    private store: NavetStore,
    readonly state: IntegrationState,
  ) {}
  listFlagged() {
    return tracked(this.store, "mail", graphFlaggedMail);
  }
  summary() {
    return tracked(this.store, "mail", graphMailSummary);
  }
}

export interface MsFeatureStatus {
  state: IntegrationState;
  connection: MsConnection | null;
  health: MsHealth;
}

/** Where one part of the Microsoft connection (mail or calendar) stands right now. */
export async function msFeatureStatus(store: NavetStore, feature: MsFeature): Promise<MsFeatureStatus> {
  const health = await loadMsHealth(store);
  if (!outlookConfigured() || !sessionSecretOk()) return { state: "not_configured", connection: null, health };
  if (!integrationsUnlocked()) return { state: "locked", connection: null, health };
  const connection = await loadMsConnection(store);
  if (!connection || !connection.features[feature]) return { state: "disconnected", connection, health };
  if (health.needsReauth) return { state: "needs_reauth", connection, health };
  return { state: health[feature].lastError ? "error" : "connected", connection, health };
}

const usable = (state: IntegrationState) => state === "connected" || state === "error";

/** Outlook when connected, sample data only in demo mode, otherwise nothing. */
export async function getCalendarProvider(store: NavetStore): Promise<CalendarProvider> {
  const { state } = await msFeatureStatus(store, "calendar");
  if (usable(state)) return new OutlookCalendarProvider(store, state);
  return env.demoMode ? new DemoCalendarProvider() : new NoCalendarProvider(state);
}

export async function getMailProvider(store: NavetStore): Promise<MailProvider> {
  const { state } = await msFeatureStatus(store, "mail");
  if (usable(state)) return new OutlookMailProvider(store, state);
  return env.demoMode ? new DemoMailProvider() : new NoMailProvider(state);
}
