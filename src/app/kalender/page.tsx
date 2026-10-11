"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, format, startOfDay, startOfWeek } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarClock, ChevronLeft, ChevronRight, Users, Video } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Notice, PageHeader } from "@/components/ui";
import { ConnectNotice } from "@/components/connect-notice";
import { TypeIcon } from "@/components/icons";
import { useCalendar } from "@/hooks/use-remote";
import { attendeeSummary, byStart, eventTimeLabel, occursOn } from "@/lib/calendar";
import { toISODate, todayISO } from "@/lib/dates";
import { isActive } from "@/lib/selectors";

export default function CalendarPage() {
  const { items, openItem } = useNavet();
  const [offset, setOffset] = useState(0);
  const weekStart = useMemo(() => addDays(startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 }), offset * 7), [offset]);
  const calendar = useCalendar(weekStart, 7);
  const events = calendar.data;
  const { status } = useNavet();
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div>
      <PageHeader
        title="Kalender"
        subtitle={`Vecka ${format(weekStart, "I")} · ${format(weekStart, "d MMM", { locale: sv })} – ${format(addDays(weekStart, 6), "d MMM", { locale: sv })}`}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o - 1)} aria-label="Föregående vecka">
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="sm" onClick={() => setOffset(0)}>Idag</Button>
            <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o + 1)} aria-label="Nästa vecka">
              <ChevronRight className="size-4" />
            </Button>
          </>
        }
      />
      <div className="mb-8">
        {calendar.provider === "none" && calendar.state !== "error" ? (
          <ConnectNotice state={calendar.state} what="dina möten" extra="Dina deadlines från Navet visas redan." />
        ) : calendar.error ? (
          <Notice icon={<CalendarClock className="size-4" />}>
            <strong className="font-semibold">{calendar.error}</strong>{" "}
            <Link href="/integrationer" className="underline underline-offset-2">Öppna Integrationer</Link>
          </Notice>
        ) : calendar.provider === "outlook" ? (
          <Notice tone="muted" icon={<CalendarClock className="size-4" />}>
            Möten från Outlook{status?.outlook ? ` (${status.outlook.email})` : ""} tillsammans med dina deadlines i Navet. Tryck på ett möte för att öppna det i Outlook.
          </Notice>
        ) : calendar.provider === "demo" ? (
          <Notice icon={<CalendarClock className="size-4" />}>
            <strong className="font-semibold">Demoläge.</strong> Mötena nedan är exempel och kommer inte från något konto.
          </Notice>
        ) : null}
      </div>
      <div className="space-y-3">
        {days.map((day) => {
          const iso = toISODate(day);
          // Multi-day events (a course week) are listed on every day they cover.
          const dayEvents = (events ?? []).filter((e) => occursOn(e, iso)).sort(byStart);
          const dayItems = items.filter((i) => i.dueDate === iso && isActive(i));
          const isToday = iso === today;
          return (
            <div
              key={iso}
              className={clsx(
                "grid gap-4 rounded-2xl border p-4 sm:grid-cols-[120px_1fr] sm:p-5",
                isToday ? "border-accent/30 bg-surface shadow-card" : "border-line bg-surface/60",
              )}
            >
              <div>
                <p className={clsx("text-sm font-semibold capitalize", isToday ? "text-accent" : "text-ink")}>
                  {format(day, "EEEE", { locale: sv })}
                </p>
                <p className="text-sm text-ink-3">{format(day, "d MMMM", { locale: sv })}</p>
              </div>
              <div className="space-y-2">
                {dayEvents.map((e) => (
                  <div key={e.id} className="flex gap-3 text-[15px]">
                    <span className="w-24 shrink-0 tabular-nums text-ink-2">{eventTimeLabel(e, iso)}</span>
                    <div className="min-w-0 text-ink">
                      <p>
                        {e.link ? (
                          <a href={e.link} target="_blank" rel="noreferrer" className="hover:underline">
                            {e.title}
                          </a>
                        ) : (
                          e.title
                        )}
                        {e.location && <span className="text-ink-3"> · {e.location}</span>}
                      </p>
                      {(attendeeSummary(e) || e.onlineUrl) && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-3">
                          {attendeeSummary(e) && (
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <Users className="size-3.5 shrink-0" /> {attendeeSummary(e)}
                            </span>
                          )}
                          {e.onlineUrl && (
                            <a href={e.onlineUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                              <Video className="size-3.5" /> Anslut till mötet
                            </a>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {dayItems.map((i) => (
                  <button key={i.id} onClick={() => openItem(i)} className="flex w-full gap-3 text-left text-[15px]">
                    <span className="flex w-24 shrink-0 items-center gap-1.5 text-ink-3">
                      <TypeIcon type={i.type} className="size-3.5" />
                      {i.dueTime ?? "Deadline"}
                    </span>
                    <span className="text-ink-2">{i.title}</span>
                  </button>
                ))}
                {!dayEvents.length && !dayItems.length && <p className="text-sm text-ink-3">–</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
