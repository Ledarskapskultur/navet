"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { ItemList } from "@/components/item-row";
import { Card, EmptyState, Section, Button } from "@/components/ui";
import { CalendarTimeline } from "@/components/calendar-timeline";
import { useCalendar, useFlaggedMail } from "@/hooks/use-remote";
import { formatLongDate, greeting, todayISO } from "@/lib/dates";
import { byDue, byNewest, isActionable, isActive, isDueToday, isOverdue, mostImportant } from "@/lib/selectors";

export default function TodayPage() {
  const { items, projects, openCapture, status } = useNavet();
  const events = useCalendar();
  const mails = useFlaggedMail();
  const today = todayISO();

  const important = mostImportant(items, 5, today);
  const importantIds = new Set(important.map((i) => i.id));
  const dueToday = items.filter((i) => isDueToday(i, today) && !importantIds.has(i.id) && i.type !== "waiting").sort(byDue);
  const overdue = items.filter((i) => isOverdue(i, today) && isActionable(i));
  const waiting = items.filter((i) => i.type === "waiting" && isActive(i));
  const inbox = items.filter((i) => i.status === "inbox").sort(byNewest);
  const todayCount = items.filter((i) => isDueToday(i, today) && isActionable(i)).length;
  const firstName = status?.user?.name?.split(" ")[0];

  const attention = [
    { n: overdue.length, label: overdue.length === 1 ? "försenad uppgift" : "försenade uppgifter", href: "/att-gora?filter=overdue", tone: "warn" },
    { n: mails?.length ?? 0, label: "flaggade mail", href: "/mail", tone: "neutral" },
    { n: waiting.length, label: waiting.length === 1 ? "sak du väntar på" : "saker du väntar på", href: "/vantar-pa", tone: "neutral" },
    { n: inbox.length, label: inbox.length === 1 ? "ny sak i inkorgen" : "nya saker i inkorgen", href: "/inkorg", tone: "accent" },
  ];

  return (
    <div>
      <header className="mb-10">
        <p className="text-sm font-medium text-ink-3">{formatLongDate()}</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-3 text-[15px] text-ink-2">
          {todayCount > 0
            ? `Du har ${todayCount} ${todayCount === 1 ? "sak" : "saker"} planerade idag${overdue.length ? `, ${overdue.length} försenade` : ""} och ${events?.length ?? 0} möten.`
            : "Inget planerat idag ännu – fånga det som snurrar i huvudet."}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
        <div>
          <Section title="Viktigast idag" count={important.length}>
            <ItemList
              items={important}
              empty={
                <EmptyState
                  title="Inget brådskande"
                  text="Inga försenade eller prioriterade saker. Bra jobbat."
                  action={<Button onClick={() => openCapture()}>+ Fånga något</Button>}
                />
              }
            />
          </Section>

          {dueToday.length > 0 && (
            <Section title="Också idag" count={dueToday.length}>
              <ItemList items={dueToday} />
            </Section>
          )}

          <Section title="Behöver din uppmärksamhet">
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

        <aside>
          <Section
            title="Kalender idag"
            action={
              <Link href="/kalender" className="text-sm text-ink-2 hover:text-ink">
                Vecka
              </Link>
            }
          >
            <Card className="p-4">
              <CalendarTimeline events={events} />
              <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-ink-3">
                <CalendarDays className="size-3.5" /> Demokalender · Outlook-integration kommer senare
              </p>
            </Card>
          </Section>

          <Section title="Projekt">
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
