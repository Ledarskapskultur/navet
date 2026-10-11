"use client";

import Link from "next/link";
import { CalendarDays, CalendarPlus, ExternalLink, PenLine } from "lucide-react";
import { CalendarTimeline } from "@/components/calendar-timeline";
import { ConnectNotice } from "@/components/connect-notice";
import { LinkedInIcon } from "@/components/icons";
import { Card, Pill, Section } from "@/components/ui";
import { byStart, eventDays, eventTimeLabel, occursOn } from "@/lib/calendar";
import { formatDue, toISODate } from "@/lib/dates";
import { STATE_LABEL, type IntegrationState, type IntegrationStatus } from "@/lib/integrations/types";
import type { CalendarEvent, RemoteProviderKind } from "@/lib/types";

/** Opens Outlook's own "new event" form. Booking inside Navet comes with the calendar phase. */
const OUTLOOK_NEW_EVENT = "https://outlook.office.com/calendar/deeplink/compose";

export function CalendarPanel({
  events,
  provider,
  state,
  error,
  className,
}: {
  className?: string;
  events: CalendarEvent[] | null;
  provider: RemoteProviderKind | null;
  state: IntegrationState | null;
  error: string | null;
}) {
  const live = provider === "outlook" || provider === "demo";
  const today = toISODate(new Date());
  // An event that spans several days (a course week) is on the agenda every one of them.
  const todays = events?.filter((e) => occursOn(e, today)) ?? null;
  const upcoming = (events ?? [])
    .filter((e) => eventDays(e).first > today)
    .sort((a, b) => eventDays(a).first.localeCompare(eventDays(b).first) || byStart(a, b))
    .slice(0, 5);
  // A failed fetch shows the error only – an empty agenda would look like a free day.
  const failed = Boolean(error);

  return (
    <Section
      className={className}
      title="Kalender"
      action={
        <Link href="/kalender" className="text-sm text-ink-2 hover:text-ink">
          Vecka
        </Link>
      }
    >
      {provider === "none" && state !== "error" ? (
        <ConnectNotice state={state} what="dina riktiga möten" />
      ) : (
        <Card className="p-4">
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
              {error}{" "}
              <Link href="/integrationer" className="font-medium underline underline-offset-2">
                Öppna Integrationer
              </Link>
            </p>
          )}
          {!failed && (
            <>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Dagens agenda</p>
              <CalendarTimeline events={todays} />
            </>
          )}

          {!failed && upcoming.length > 0 && (
            <>
              <p className="mb-2 mt-4 border-t border-line pt-4 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Kommande möten</p>
              <ul className="space-y-2.5">
                {upcoming.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p className="text-xs text-ink-3">
                      {formatDue(eventDays(e).first)} · {eventTimeLabel(e, eventDays(e).first).toLowerCase()}
                    </p>
                    {e.link ? (
                      <a href={e.link} target="_blank" rel="noreferrer" className="text-[15px] leading-snug text-ink hover:underline">
                        {e.title}
                      </a>
                    ) : (
                      <p className="text-[15px] leading-snug text-ink">{e.title}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {provider !== null && (
          <div className={failed ? "" : "mt-4 border-t border-line pt-4"}>
            {live && provider === "outlook" ? (
              <a
                href={OUTLOOK_NEW_EVENT}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[15px] font-medium text-ink transition-colors hover:bg-subtle"
              >
                <CalendarPlus className="size-4" /> Boka nytt möte <ExternalLink className="size-3.5 text-ink-3" />
              </a>
            ) : null}
            {!failed && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-3">
                <CalendarDays className="mt-px size-3.5 shrink-0" />
                {provider === "outlook"
                  ? "Från din Outlook-kalender. Boka nytt möte öppnar Outlook tills bokning direkt i Navet är byggd."
                  : "Demoläge: mötena är exempel och kommer inte från något konto."}
              </p>
            )}
          </div>
          )}
        </Card>
      )}
    </Section>
  );
}

const STATE_STYLE: Record<IntegrationState, string> = {
  connected: "bg-accent-soft text-accent-strong",
  disconnected: "bg-subtle text-ink-2",
  not_configured: "bg-amber-soft text-amber",
  locked: "bg-amber-soft text-amber",
  needs_reauth: "bg-warn-soft text-warn",
  error: "bg-warn-soft text-warn",
};

/** LinkedIn: connection status, drafts, planned posts and account. */
export function LinkedInPanel({ integration, className }: { integration: IntegrationStatus | null; className?: string }) {
  return (
    <Section
      className={className}
      title="LinkedIn"
      action={
        <Link href="/integrationer" className="text-sm text-ink-2 hover:text-ink">
          Integrationer
        </Link>
      }
    >
      <Card className="p-4 text-sm">
        {!integration ? (
          <div className="h-20 animate-pulse rounded-xl bg-subtle" />
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <LinkedInIcon className="size-5 text-ink-2" />
              <span className="font-medium text-ink">{integration.account?.name ?? "Inget konto anslutet"}</span>
              <Pill className={`ml-auto ${STATE_STYLE[integration.state]}`}>{STATE_LABEL[integration.state]}</Pill>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-3">Utkast</dt>
                <dd className="mt-0.5 text-ink-3">–</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-3">Planerade inlägg</dt>
                <dd className="mt-0.5 text-ink-3">–</dd>
              </div>
            </dl>
            <p className="mt-3 text-ink-3">
              {integration.availabilityNote ?? "Utkast och planerade inlägg visas här."} Tills dess kan du skriva inlägget direkt på LinkedIn.
            </p>
            <a
              href="https://www.linkedin.com/feed/?shareActive=true"
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[15px] font-medium text-ink transition-colors hover:bg-subtle"
            >
              <PenLine className="size-4" /> Skriv inlägg på LinkedIn <ExternalLink className="size-3.5 text-ink-3" />
            </a>
          </>
        )}
      </Card>
    </Section>
  );
}
