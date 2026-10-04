"use client";

import { useEffect, useState } from "react";
import { addDays, startOfDay } from "date-fns";
import { api } from "@/lib/client-api";
import type { CalendarEvent, FlaggedMail } from "@/lib/types";

export function useCalendar(from: Date = startOfDay(new Date()), days = 1) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const key = `${from.toISOString()}|${days}`;
  useEffect(() => {
    const [fromIso, d] = key.split("|");
    const q = new URLSearchParams({
      from: fromIso,
      to: addDays(new Date(fromIso), Number(d)).toISOString(),
      tz: String(new Date().getTimezoneOffset()),
    });
    let alive = true;
    api<{ events: CalendarEvent[] }>(`/api/calendar?${q}`)
      .then((r) => alive && setEvents(r.events))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [key]);
  return events;
}

export function useFlaggedMail() {
  const [mails, setMails] = useState<FlaggedMail[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ mails: FlaggedMail[] }>("/api/mail")
      .then((r) => alive && setMails(r.mails))
      .catch(() => alive && setMails([]));
    return () => {
      alive = false;
    };
  }, []);
  return mails;
}
