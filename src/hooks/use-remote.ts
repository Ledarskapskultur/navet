"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, startOfDay } from "date-fns";
import { api } from "@/lib/client-api";
import type { IntegrationState, IntegrationStatus } from "@/lib/integrations/types";
import type { CalendarEvent, MailMessage, MailSummary, RemoteProviderKind } from "@/lib/types";

interface Remote<T> {
  data: T[] | null;
  /** null while loading */
  provider: RemoteProviderKind | null;
  /** Why there is (or isn't) data: connected, disconnected, needs_reauth … */
  state: IntegrationState | null;
  error: string | null;
}

const LOADING = { data: null, provider: null, state: null, error: null };

export function useCalendar(from: Date = startOfDay(new Date()), days = 1): Remote<CalendarEvent> {
  const [state, setState] = useState<Remote<CalendarEvent>>(LOADING);
  const key = `${from.toISOString()}|${days}`;
  useEffect(() => {
    const [fromIso, d] = key.split("|");
    const q = new URLSearchParams({
      from: fromIso,
      to: addDays(new Date(fromIso), Number(d)).toISOString(),
      tz: String(new Date().getTimezoneOffset()),
    });
    let alive = true;
    api<{ events: CalendarEvent[]; provider: RemoteProviderKind; state: IntegrationState; error?: string }>(`/api/calendar?${q}`)
      .then((r) => alive && setState({ data: r.events, provider: r.provider, state: r.state, error: r.error ?? null }))
      .catch((e) => alive && setState({ data: [], provider: null, state: "error", error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [key]);
  return state;
}

export function useFlaggedMail(): Remote<MailMessage> {
  const [state, setState] = useState<Remote<MailMessage>>(LOADING);
  useEffect(() => {
    let alive = true;
    api<{ mails: MailMessage[]; provider: RemoteProviderKind; state: IntegrationState; error?: string }>("/api/mail")
      .then((r) => alive && setState({ data: r.mails, provider: r.provider, state: r.state, error: r.error ?? null }))
      .catch((e) => alive && setState({ data: [], provider: null, state: "error", error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export interface RemoteSummary {
  summary: MailSummary | null;
  provider: RemoteProviderKind | null;
  state: IntegrationState | null;
  error: string | null;
}

/** The mailbox at a glance: counts plus important, flagged and latest mail. */
export function useMailSummary(): RemoteSummary {
  const [state, setState] = useState<RemoteSummary>({ summary: null, provider: null, state: null, error: null });
  useEffect(() => {
    let alive = true;
    api<{ summary: MailSummary; provider: RemoteProviderKind; state: IntegrationState; error?: string }>("/api/mail/summary")
      .then((r) => alive && setState({ summary: r.summary, provider: r.provider, state: r.state, error: r.error ?? null }))
      .catch((e) => alive && setState({ summary: null, provider: "none", state: "error", error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export interface RemoteIntegrations {
  integrations: IntegrationStatus[] | null;
  error: string | null;
  /** Replace the list with a fresh one from the server (after connect, disconnect or test) */
  set: (list: IntegrationStatus[]) => void;
  reload: () => Promise<void>;
}

export function useIntegrations(): RemoteIntegrations {
  const [integrations, setIntegrations] = useState<IntegrationStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(
    () =>
      api<{ integrations: IntegrationStatus[] }>("/api/integrations")
        .then((r) => {
          setIntegrations(r.integrations);
          setError(null);
        })
        .catch((e) => setError((e as Error).message)),
    [],
  );
  useEffect(() => {
    let alive = true;
    api<{ integrations: IntegrationStatus[] }>("/api/integrations")
      .then((r) => alive && setIntegrations(r.integrations))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, []);
  return { integrations, error, set: setIntegrations, reload };
}
