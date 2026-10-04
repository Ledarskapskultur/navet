import "server-only";
import type { CalendarEvent, FlaggedMail } from "../../types";

/** Thin Microsoft Graph client for the calendar and flagged mail. */
const GRAPH = "https://graph.microsoft.com/v1.0";

export class GraphAuthError extends Error {
  constructor() {
    super("Outlook-kopplingen har gått ut. Koppla Outlook igen under Inställningar.");
  }
}

async function graph<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    // Ask for UTC so times can be shown in the viewer's own time zone.
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
    cache: "no-store",
  });
  if (res.status === 401) throw new GraphAuthError();
  if (!res.ok) throw new Error(`Microsoft Graph ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
      $select: "id,subject,start,end,isAllDay,isCancelled,showAs,location,attendees,webLink",
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
  from?: { emailAddress: { name: string; address: string } };
}

export async function graphFlaggedMail(token: string): Promise<FlaggedMail[]> {
  const q = new URLSearchParams({
    $filter: "flag/flagStatus eq 'flagged'",
    $select: "id,subject,bodyPreview,receivedDateTime,from,webLink",
    $top: "50",
  });
  const res = await graph<{ value: GraphMessage[] }>(token, `/me/messages?${q}`);
  return res.value
    .map((m) => ({
      id: m.id,
      from: m.from?.emailAddress.name || m.from?.emailAddress.address || "Okänd avsändare",
      fromEmail: m.from?.emailAddress.address ?? "",
      subject: m.subject || "(utan ämne)",
      preview: m.bodyPreview,
      receivedAt: m.receivedDateTime,
      link: m.webLink,
      source: "outlook_mail" as const,
    }))
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
}

export async function graphMe(token: string): Promise<{ name: string; email: string }> {
  const me = await graph<{ displayName: string; mail: string | null; userPrincipalName: string }>(
    token,
    "/me?$select=displayName,mail,userPrincipalName",
  );
  return { name: me.displayName, email: me.mail ?? me.userPrincipalName };
}
