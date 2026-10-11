import "server-only";
import type { CalendarEvent, MailMessage, MailSummary } from "../../types";

/** Thin Microsoft Graph client for the calendar and the mailbox. */
const GRAPH = "https://graph.microsoft.com/v1.0";

/** The stored sign-in is missing or no longer accepted – the user has to connect again. */
export class GraphAuthError extends Error {
  constructor(message = "Outlook-kopplingen har gått ut. Anslut kontot igen under Integrationer.") {
    super(message);
  }
}

/** Graph answered, but with an error (missing permission, throttling, outage …). */
export class GraphError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function describe(status: number, code: string): string {
  if (status === 403) return "Navet saknar behörighet för det här hos Microsoft. Kontrollera behörigheterna under Integrationer.";
  if (status === 404) return "Microsoft hittade inte det som efterfrågades.";
  if (status === 429) return "Microsoft begränsar antalet anrop just nu. Försök igen om en stund.";
  if (status >= 500) return "Microsoft Graph svarar inte just nu. Försök igen om en stund.";
  return `Microsoft Graph svarade med fel ${status}${code ? ` (${code})` : ""}.`;
}

async function graph<T>(token: string, path: string, attempt = 0): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GRAPH}${path}`, {
      // Ask for UTC so times can be shown in the viewer's own time zone.
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
      cache: "no-store",
    });
  } catch {
    throw new GraphError(0, "network", "Kunde inte nå Microsoft Graph. Kontrollera anslutningen och försök igen.");
  }
  if (res.status === 401) throw new GraphAuthError();
  // Throttled or temporarily unavailable: wait briefly and try once more.
  if ((res.status === 429 || res.status === 503) && attempt === 0) {
    const wait = Math.min(Number(res.headers.get("retry-after")) || 1, 3);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return graph<T>(token, path, 1);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    const code = body?.error?.code ?? "";
    throw new GraphError(res.status, code, describe(res.status, code));
  }
  return res.json() as Promise<T>;
}

const utc = (dateTime: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(dateTime) ? dateTime : `${dateTime}Z`);

interface GraphEvent {
  id: string;
  subject: string | null;
  start: { dateTime: string };
  end: { dateTime: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: string;
  location?: { displayName?: string };
  attendees?: { emailAddress: { name: string } }[];
  organizer?: { emailAddress?: { name?: string; address?: string } };
  onlineMeeting?: { joinUrl?: string } | null;
  webLink?: string;
}

export async function graphCalendarView(token: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let path: string | null =
    `/me/calendarView?${new URLSearchParams({
      startDateTime: from.toISOString(),
      endDateTime: to.toISOString(),
      $orderby: "start/dateTime",
      $top: "100",
      $select: "id,subject,start,end,isAllDay,isCancelled,showAs,location,attendees,organizer,onlineMeeting,webLink",
    })}`;
  while (path) {
    const res: { value: GraphEvent[]; "@odata.nextLink"?: string } = await graph(token, path);
    for (const e of res.value) {
      if (e.isCancelled) continue;
      events.push({
        id: e.id,
        title: e.subject || "(utan rubrik)",
        start: utc(e.start.dateTime),
        end: utc(e.end.dateTime),
        allDay: e.isAllDay ?? false,
        location: e.location?.displayName || undefined,
        attendees: e.attendees?.map((a) => a.emailAddress.name),
        organizer: e.organizer?.emailAddress?.name || e.organizer?.emailAddress?.address || undefined,
        onlineUrl: e.onlineMeeting?.joinUrl || undefined,
        showAs: e.showAs,
        link: e.webLink,
        source: "outlook_calendar",
      });
    }
    path = res["@odata.nextLink"]?.replace(GRAPH, "") ?? null;
  }
  return events;
}

interface GraphMessage {
  id: string;
  subject: string | null;
  bodyPreview: string;
  receivedDateTime: string;
  webLink?: string;
  isRead?: boolean;
  importance?: "low" | "normal" | "high";
  hasAttachments?: boolean;
  conversationId?: string;
  flag?: { flagStatus?: string };
  from?: { emailAddress: { name: string; address: string } };
}

const MESSAGE_FIELDS = "id,subject,bodyPreview,receivedDateTime,from,webLink,isRead,importance,hasAttachments,conversationId,flag";

function toMail(m: GraphMessage): MailMessage {
  return {
    id: m.id,
    from: m.from?.emailAddress.name || m.from?.emailAddress.address || "Okänd avsändare",
    fromEmail: m.from?.emailAddress.address ?? "",
    subject: m.subject || "(utan ämne)",
    preview: m.bodyPreview ?? "",
    receivedAt: m.receivedDateTime,
    link: m.webLink,
    isRead: m.isRead,
    flagged: m.flag?.flagStatus === "flagged",
    importance: m.importance,
    hasAttachments: m.hasAttachments,
    conversationId: m.conversationId,
    source: "outlook_mail",
  };
}

const newestFirst = (a: MailMessage, b: MailMessage) => (a.receivedAt < b.receivedAt ? 1 : -1);

interface MessagePage {
  value: GraphMessage[];
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
}

async function flaggedPage(token: string): Promise<MessagePage> {
  const q = new URLSearchParams({
    $filter: "flag/flagStatus eq 'flagged'",
    $select: MESSAGE_FIELDS,
    $top: "50",
    $count: "true",
  });
  return graph<MessagePage>(token, `/me/messages?${q}`);
}

export async function graphFlaggedMail(token: string): Promise<MailMessage[]> {
  return (await flaggedPage(token)).value.map(toMail).sort(newestFirst);
}

/** The newest messages in the inbox. */
export async function graphInboxLatest(token: string, top = 6): Promise<MailMessage[]> {
  const q = new URLSearchParams({ $select: MESSAGE_FIELDS, $orderby: "receivedDateTime desc", $top: String(top) });
  const res = await graph<MessagePage>(token, `/me/mailFolders/inbox/messages?${q}`);
  return res.value.map(toMail);
}

/** Messages the sender marked as high importance, from the last `days` days. */
export async function graphImportantMail(token: string, top = 5, days = 30, now = new Date()): Promise<MailMessage[]> {
  const since = new Date(now.getTime() - days * 86400_000).toISOString();
  const q = new URLSearchParams({
    // Graph requires the $orderby property to come first in $filter.
    $filter: `receivedDateTime ge ${since} and importance eq 'high'`,
    $orderby: "receivedDateTime desc",
    $select: MESSAGE_FIELDS,
    $top: String(top),
  });
  const res = await graph<MessagePage>(token, `/me/mailFolders/inbox/messages?${q}`);
  return res.value.map(toMail);
}

export async function graphInboxCounts(token: string): Promise<{ unread: number; total: number }> {
  const f = await graph<{ unreadItemCount: number; totalItemCount: number }>(
    token,
    "/me/mailFolders/inbox?$select=unreadItemCount,totalItemCount",
  );
  return { unread: f.unreadItemCount, total: f.totalItemCount };
}

/**
 * Everything the start page shows about the mailbox, fetched in parallel. One failing part
 * leaves that part empty (count unknown) instead of blanking the rest; a rejected sign-in,
 * or everything failing, is an error.
 */
export async function graphMailSummary(token: string): Promise<MailSummary> {
  const results = await Promise.allSettled([graphInboxCounts(token), flaggedPage(token), graphInboxLatest(token), graphImportantMail(token)]);
  const failed = results.filter((r) => r.status === "rejected");
  const auth = failed.find((r) => r.reason instanceof GraphAuthError);
  if (auth) throw auth.reason;
  if (failed.length === results.length) throw failed[0].reason;
  const [counts, flagged, latest, important] = results;
  const page = flagged.status === "fulfilled" ? flagged.value : null;
  return {
    unreadCount: counts.status === "fulfilled" ? counts.value.unread : null,
    flaggedCount: page ? (page["@odata.count"] ?? page.value.length) : null,
    flaggedMore: Boolean(page?.["@odata.nextLink"]) && page?.["@odata.count"] === undefined,
    important: important.status === "fulfilled" ? important.value : [],
    flagged: page ? page.value.map(toMail).sort(newestFirst).slice(0, 6) : [],
    latest: latest.status === "fulfilled" ? latest.value : [],
  };
}

/** The default calendar's name – a cheap call used to verify calendar access. */
export async function graphCalendarInfo(token: string): Promise<{ name: string }> {
  return graph<{ name: string }>(token, "/me/calendar?$select=name");
}

export async function graphMe(token: string): Promise<{ name: string; email: string; id?: string }> {
  const me = await graph<{ id?: string; displayName: string; mail: string | null; userPrincipalName: string }>(
    token,
    "/me?$select=id,displayName,mail,userPrincipalName",
  );
  return { name: me.displayName, email: me.mail ?? me.userPrincipalName, id: me.id };
}
