import "server-only";
import type { CalendarEvent, FlaggedMail } from "../../types";

/**
 * Microsoft Graph integration – prepared but not yet active.
 *
 * Next step: implement OAuth against
 *   https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize
 * with scopes "offline_access User.Read Calendars.Read Mail.Read", store the
 * tokens the same way as Google (encrypted session / database), and pass an
 * access-token getter to the functions below.
 */
const GRAPH = "https://graph.microsoft.com/v1.0";

async function graph<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="Europe/Stockholm"' },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Microsoft Graph ${res.status}`);
  return res.json() as Promise<T>;
}

interface GraphEvent {
  id: string;
  subject: string;
  start: { dateTime: string };
  end: { dateTime: string };
  location?: { displayName?: string };
  attendees?: { emailAddress: { name: string } }[];
}

export async function graphCalendarView(token: string, from: string, to: string): Promise<CalendarEvent[]> {
  const q = new URLSearchParams({ startDateTime: from, endDateTime: to, $orderby: "start/dateTime", $top: "100" });
  const res = await graph<{ value: GraphEvent[] }>(token, `/me/calendarView?${q}`);
  return res.value.map((e) => ({
    id: e.id,
    title: e.subject,
    start: e.start.dateTime,
    end: e.end.dateTime,
    location: e.location?.displayName,
    attendees: e.attendees?.map((a) => a.emailAddress.name),
    source: "outlook_calendar",
  }));
}

interface GraphMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  receivedDateTime: string;
  from: { emailAddress: { name: string; address: string } };
}

export async function graphFlaggedMail(token: string): Promise<FlaggedMail[]> {
  const q = new URLSearchParams({
    $filter: "flag/flagStatus eq 'flagged'",
    $select: "id,subject,bodyPreview,receivedDateTime,from",
    $top: "50",
  });
  const res = await graph<{ value: GraphMessage[] }>(token, `/me/messages?${q}`);
  return res.value.map((m) => ({
    id: m.id,
    from: m.from.emailAddress.name,
    fromEmail: m.from.emailAddress.address,
    subject: m.subject,
    preview: m.bodyPreview,
    receivedAt: m.receivedDateTime,
    source: "outlook_mail",
  }));
}
