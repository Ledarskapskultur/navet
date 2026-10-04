"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { addDays, format, startOfDay, startOfWeek } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Notice, PageHeader } from "@/components/ui";
import { TypeIcon } from "@/components/icons";
import { useCalendar } from "@/hooks/use-remote";
import { formatTime, toISODate, todayISO } from "@/lib/dates";
import { isActive } from "@/lib/selectors";

export default function CalendarPage() {
  const { items, openItem } = useNavet();
  const [offset, setOffset] = useState(0);
  const weekStart = useMemo(() => addDays(startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 }), offset * 7), [offset]);
  const events = useCalendar(weekStart, 7);
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
        <Notice icon={<CalendarClock className="size-4" />}>
          <strong className="font-semibold">Outlook-integration kommer senare.</strong> Mötena nedan är demodata. Arkitekturen är
          förberedd för Microsoft Graph (<code className="text-xs">/me/calendarView</code>) – dina deadlines från Navet visas redan på riktigt.
        </Notice>
      </div>
      <div className="space-y-3">
        {days.map((day) => {
          const iso = toISODate(day);
          const dayEvents = (events ?? []).filter((e) => toISODate(new Date(e.start)) === iso);
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
                    <span className="w-24 shrink-0 tabular-nums text-ink-2">
                      {formatTime(e.start)}–{formatTime(e.end)}
                    </span>
                    <span className="text-ink">
                      {e.title}
                      {e.location && <span className="text-ink-3"> · {e.location}</span>}
                    </span>
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
