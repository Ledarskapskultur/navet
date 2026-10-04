"use client";

import { useEffect, useState } from "react";
import { addDays, startOfDay } from "date-fns";
import { api } from "@/lib/client-api";
import type { CalendarEvent, FlaggedMail } from "@/lib/types";

interface Remote<T> {
  data: T[] | null;
  provider: "demo" | "outlook" | null;
  error: string | null;
}

export function useCalendar(from: Date = startOfDay(new Date()), days = 1): Remote<CalendarEvent> {
  const [state, setState] = useState<Remote<CalendarEvent>>({ data: null, provider: null, error: null });
  const key = `${from.toISOString()}|${days}`;
  useEffect(() => {
    const [fromIso, d] = key.split("|");
    const q = new URLSearchParams({
      from: fromIso,
      to: addDays(new Date(fromIso), Number(d)).toISOString(),
      tz: String(new Date().getTimezoneOffset()),
    });
    let alive = true;
    api<{ events: CalendarEvent[]; provider: "demo" | "outlook"; error?: string }>(`/api/calendar?${q}`)
      .then((r) => alive && setState({ data: r.events, provider: r.provider, error: r.error ?? null }))
      .catch((e) => alive && setState({ data: [], provider: null, error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [key]);
  return state;
}

export function useFlaggedMail(): Remote<FlaggedMail> {
  const [state, setState] = useState<Remote<FlaggedMail>>({ data: null, provider: null, error: null });
  useEffect(() => {
    let alive = true;
    api<{ mails: FlaggedMail[]; provider: "demo" | "outlook"; error?: string }>("/api/mail")
      .then((r) => alive && setState({ data: r.mails, provider: r.provider, error: r.error ?? null }))
      .catch((e) => alive && setState({ data: [], provider: null, error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
