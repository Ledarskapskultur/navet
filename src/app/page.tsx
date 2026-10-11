"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { ItemList } from "@/components/item-row";
import { EmptyState, Section } from "@/components/ui";
import { MailPanel } from "@/components/dashboard/mail-panel";
import { CalendarPanel, LinkedInPanel } from "@/components/dashboard/side-panels";
import { SummaryStrip } from "@/components/dashboard/summary-strip";
import { TasksPanel } from "@/components/dashboard/tasks-panel";
import { useCalendar, useIntegrations, useMailSummary } from "@/hooks/use-remote";
import { formatLongDate, greeting, todayISO, toISODate } from "@/lib/dates";
import { byNewest, isActionable, isActive, isDueToday, isOverdue } from "@/lib/selectors";

export default function TodayPage() {
  const { items, projects, status } = useNavet();
  // Today and the coming week: enough for today's agenda, upcoming meetings and "nästa möte".
  const calendar = useCalendar(undefined, 7);
  const mail = useMailSummary();
  const { integrations } = useIntegrations();
  const today = todayISO();

  const events = calendar.data;
  const calendarLive = calendar.provider === "outlook" || calendar.provider === "demo";
  const meetingsToday = (events ?? []).filter((e) => (e.allDay ? e.start.slice(0, 10) : toISODate(new Date(e.start))) === today).length;

  const overdue = items.filter((i) => isOverdue(i, today) && isActionable(i));
  const waiting = items.filter((i) => i.type === "waiting" && isActive(i));
  const inbox = items.filter((i) => i.status === "inbox").sort(byNewest);
  const newRequests = items.filter((i) => i.type === "request" && isActive(i) && (i.stage ?? "new") === "new").length;
  const todayCount = items.filter((i) => isDueToday(i, today) && isActionable(i)).length;
  const firstName = (status?.user?.name ?? status?.outlook?.name)?.split(" ")[0];

  const attention = [
    { n: overdue.length, label: overdue.length === 1 ? "försenad uppgift" : "försenade uppgifter", href: "/att-gora?filter=overdue", tone: "warn" },
    { n: newRequests, label: newRequests === 1 ? "ny förfrågan" : "nya förfrågningar", href: "/forfragningar", tone: "accent" },
    { n: waiting.length, label: waiting.length === 1 ? "sak du väntar på" : "saker du väntar på", href: "/vantar-pa", tone: "neutral" },
    { n: inbox.length, label: inbox.length === 1 ? "ny sak i inkorgen" : "nya saker i inkorgen", href: "/inkorg", tone: "accent" },
  ];

  // "Du har 3 saker planerade idag, 1 försenad och 2 möten."
  const parts: string[] = [];
  if (todayCount > 0) parts.push(`${todayCount} ${todayCount === 1 ? "sak planerad" : "saker planerade"} idag`);
  if (overdue.length) parts.push(`${overdue.length} ${overdue.length === 1 ? "försenad uppgift" : "försenade uppgifter"}`);
  if (calendarLive && meetingsToday > 0) parts.push(`${meetingsToday} ${meetingsToday === 1 ? "möte" : "möten"}${todayCount > 0 ? "" : " idag"}`);
  const sentence = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} och ${parts.at(-1)}` : parts[0];

  return (
    <div>
      <header className="mb-8">
        <p className="text-sm font-medium text-ink-3">{formatLongDate()}</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-3 text-[15px] text-ink-2">
          {sentence ? `Du har ${sentence}.` : "Inget planerat idag ännu. Fånga det som snurrar i huvudet."}
        </p>
      </header>

      <SummaryStrip events={events} calendarState={calendar.state} calendarLive={calendarLive} mail={mail} tasksToday={todayCount} />

      {/* Two columns on a wide screen. On a phone the columns dissolve (display: contents) so the
          panels can be put in the order that suits a quick look: tasks, calendar, mail, the rest. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="contents min-w-0 lg:block">
          <TasksPanel className="order-1" />
          <MailPanel mail={mail} className="order-3" />

          <Section title="Behöver din uppmärksamhet" className="order-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {attention.map((a) => (
                <Link key={a.href} href={a.href} className="group rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong">
                  <p
                    className={
                      a.n && a.tone === "warn" ? "text-3xl font-semibold text-warn" : a.n && a.tone === "accent" ? "text-3xl font-semibold text-accent" : "text-3xl font-semibold text-ink"
                    }
                  >
                    {a.n}
                  </p>
                  <p className="mt-1 text-sm leading-snug text-ink-2">{a.label}</p>
                </Link>
              ))}
            </div>
          </Section>

          <Section
            className="order-5"
            title="Inkorg"
            count={inbox.length}
            action={
              <Link href="/inkorg" className="flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
                Sortera <ArrowRight className="size-4" />
              </Link>
            }
          >
            <ItemList items={inbox.slice(0, 4)} empty={<EmptyState title="Inkorgen är tom" text="Allt är sorterat." />} />
          </Section>
        </div>

        <aside className="contents min-w-0 lg:block">
          <CalendarPanel className="order-2" events={events} provider={calendar.provider} state={calendar.state} error={calendar.error} />
          <LinkedInPanel className="order-6" integration={integrations?.find((i) => i.id === "linkedin") ?? null} />

          <Section title="Projekt" className="order-7">
            <div className="space-y-1">
              {projects
                .filter((p) => !p.archived)
                .map((p) => {
                  const n = items.filter((i) => i.projectId === p.id && isActive(i)).length;
                  return (
                    <Link key={p.id} href={`/projekt/${p.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface">
                      <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                      <span className="flex-1 text-[15px]">{p.name}</span>
                      <span className="text-sm tabular-nums text-ink-3">{n}</span>
                    </Link>
                  );
                })}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
