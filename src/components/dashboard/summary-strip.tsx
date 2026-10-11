"use client";

import Link from "next/link";
import clsx from "clsx";
import { CalendarClock, Flag, MailOpen, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { formatDue, formatTime, toISODate } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";
import type { RemoteSummary } from "@/hooks/use-remote";
import type { IntegrationState } from "@/lib/integrations/types";

/** The next meeting that hasn't ended: one that is going on now, otherwise the next to start. */
export function nextMeeting(events: CalendarEvent[] | null, now = new Date()): CalendarEvent | null {
  return (
    (events ?? [])
      .filter((e) => !e.allDay && new Date(e.end) > now)
      .sort((a, b) => (a.start < b.start ? -1 : 1))[0] ?? null
  );
}

function untilText(start: Date, now: Date): string {
  const mins = Math.round((start.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return "pågår nu";
  if (mins < 60) return `om ${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `om ${hours} tim` : "";
}

function Tile({ icon, label, value, sub, href, loading, muted }: { icon: ReactNode; label: string; value: ReactNode; sub: ReactNode; href: string; loading?: boolean; muted?: boolean }) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
        {icon} {label}
      </p>
      {loading ? (
        <div className="mt-3 h-8 w-20 animate-pulse rounded-lg bg-sunken" />
      ) : (
        <p className={clsx("mt-2 truncate text-2xl font-semibold tracking-tight", muted ? "text-ink-3" : "text-ink")}>{value}</p>
      )}
      <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink-2">{loading ? "\u00a0" : sub}</p>
    </Link>
  );
}

const offText = (state: IntegrationState | null, thing: string, notConnected: string) =>
  state === "needs_reauth" ? `${thing}: anslut igen` : state === "error" ? `${thing}: kunde inte hämtas` : `${thing} är inte ${notConnected}`;

export function SummaryStrip({
  events,
  calendarState,
  calendarLive,
  mail,
  tasksToday,
}: {
  /** The coming days' events, or null while loading */
  events: CalendarEvent[] | null;
  calendarState: IntegrationState | null;
  /** True when the events come from a real (or demo) calendar */
  calendarLive: boolean;
  mail: RemoteSummary;
  tasksToday: number;
}) {
  const now = new Date();
  const next = nextMeeting(events, now);
  const today = toISODate(now);
  const meetingsToday = (events ?? []).filter((e) => (e.allDay ? e.start.slice(0, 10) : toISODate(new Date(e.start))) === today).length;
  const mailLive = mail.provider === "outlook" || mail.provider === "demo";
  const s = mail.summary;

  let meetingSub: string;
  if (!calendarLive) meetingSub = offText(calendarState, "Kalendern", "ansluten");
  else if (!next) meetingSub = "Inget bokat kommande 7 dagar";
  else {
    const start = new Date(next.start);
    const until = untilText(start, now);
    meetingSub = `${formatDue(toISODate(start))} ${formatTime(next.start)}${until ? ` · ${until}` : ""}`;
  }

  return (
    <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={<CalendarClock className="size-3.5" />}
        label="Nästa möte"
        href={calendarLive ? "/kalender" : "/integrationer"}
        loading={events === null}
        muted={!next}
        value={next ? next.title : "–"}
        sub={meetingSub}
      />
      <Tile
        icon={<MailOpen className="size-3.5" />}
        label="Olästa mejl"
        href={mailLive ? "/mail" : "/integrationer"}
        loading={mail.provider === null}
        muted={!mailLive || s?.unreadCount == null}
        value={mailLive && s?.unreadCount != null ? s.unreadCount : "–"}
        sub={mailLive ? "i inkorgen" : offText(mail.state, "Outlook", "anslutet")}
      />
      <Tile
        icon={<Flag className="size-3.5" />}
        label="Att följa upp"
        href={mailLive ? "/mail" : "/integrationer"}
        loading={mail.provider === null}
        muted={!mailLive || s?.flaggedCount == null}
        value={mailLive && s?.flaggedCount != null ? `${s.flaggedCount}${s.flaggedMore ? "+" : ""}` : "–"}
        sub={mailLive ? (s?.flaggedCount === 1 ? "flaggat mejl" : "flaggade mejl") : "Flaggade mejl i Outlook"}
      />
      <Tile
        icon={<Sun className="size-3.5" />}
        label="Idag"
        href="/att-gora?filter=today"
        loading={events === null}
        value={meetingsToday + tasksToday}
        sub={`${calendarLive ? `${meetingsToday} ${meetingsToday === 1 ? "möte" : "möten"} · ` : ""}${tasksToday} ${tasksToday === 1 ? "uppgift" : "uppgifter"}`}
      />
    </div>
  );
}
