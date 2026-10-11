"use client";

import clsx from "clsx";
import { MapPin, Users, Video } from "lucide-react";
import { attendeeSummary, byStart, eventStartLabel, eventTimeLabel } from "@/lib/calendar";
import { toISODate } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";

/** One day's events as a compact timeline. `events` should already be the ones for that day. */
export function CalendarTimeline({ events, now = new Date() }: { events: CalendarEvent[] | null; now?: Date }) {
  if (!events) return <div className="h-32 animate-pulse rounded-xl bg-subtle" />;
  if (!events.length) return <p className="py-4 text-sm text-ink-3">Inga möten idag.</p>;
  const day = toISODate(now);
  return (
    <ol className="relative space-y-1 before:absolute before:bottom-2 before:left-[52px] before:top-2 before:w-px before:bg-line">
      {[...events].sort(byStart).map((e) => {
        const past = !e.allDay && new Date(e.end) < now;
        const current = !e.allDay && new Date(e.start) <= now && new Date(e.end) >= now;
        const people = attendeeSummary(e, 2);
        return (
          <li key={e.id} className={clsx("relative flex gap-4 rounded-xl py-2 pr-2", past && "opacity-50")}>
            <span className="w-10 shrink-0 pt-0.5 text-right text-sm tabular-nums text-ink-2">{eventStartLabel(e, day)}</span>
            <span
              className={clsx(
                "relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full border-2",
                current ? "border-accent bg-accent" : "border-line-strong bg-surface",
              )}
            />
            <div className="min-w-0">
              {e.link ? (
                <a href={e.link} target="_blank" rel="noreferrer" className="text-[15px] leading-snug text-ink hover:underline">
                  {e.title}
                </a>
              ) : (
                <p className="text-[15px] leading-snug text-ink">{e.title}</p>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
                <span className="whitespace-nowrap">{eventTimeLabel(e, day)}</span>
                {e.location && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <MapPin className="size-3 shrink-0" /> <span className="truncate">{e.location}</span>
                  </span>
                )}
                {people && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <Users className="size-3 shrink-0" /> <span className="truncate">{people}</span>
                  </span>
                )}
              </p>
              {e.onlineUrl && !past && (
                <a href={e.onlineUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                  <Video className="size-3.5" /> Anslut till mötet
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
