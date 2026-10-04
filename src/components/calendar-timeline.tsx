"use client";

import clsx from "clsx";
import { MapPin } from "lucide-react";
import { formatTime } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";

export function CalendarTimeline({ events, now = new Date() }: { events: CalendarEvent[] | null; now?: Date }) {
  if (!events) return <div className="h-32 animate-pulse rounded-xl bg-subtle" />;
  if (!events.length) return <p className="py-4 text-sm text-ink-3">Inga möten idag.</p>;
  return (
    <ol className="relative space-y-1 before:absolute before:bottom-2 before:left-[52px] before:top-2 before:w-px before:bg-line">
      {[...events].sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || (a.start < b.start ? -1 : 1)).map((e) => {
        const past = !e.allDay && new Date(e.end) < now;
        const current = new Date(e.start) <= now && new Date(e.end) >= now;
        return (
          <li key={e.id} className={clsx("relative flex gap-4 rounded-xl py-2 pr-2", past && "opacity-50")}>
            <span className="w-10 shrink-0 pt-0.5 text-right text-sm tabular-nums text-ink-2">{e.allDay ? "Hel" : formatTime(e.start)}</span>
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
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
                {e.allDay ? "Heldag" : `${formatTime(e.start)}–${formatTime(e.end)}`}
                {e.location && (
                  <>
                    <MapPin className="ml-1 size-3" /> {e.location}
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
