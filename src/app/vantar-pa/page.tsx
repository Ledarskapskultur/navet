"use client";

import { Check, MessageCircle } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Card, DueBadge, EmptyState, PageHeader, ProjectBadge, Section } from "@/components/ui";
import { daysFromToday, formatDue, todayISO } from "@/lib/dates";
import { byDue, isActive, isOverdue } from "@/lib/selectors";
import type { NavetItem } from "@/lib/types";

export default function WaitingPage() {
  const { items, openCapture } = useNavet();
  const waiting = items.filter((i) => i.type === "waiting" && isActive(i)).sort(byDue);
  const done = items.filter((i) => i.type === "waiting" && i.status === "done").slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Väntar på"
        subtitle="Saker där bollen ligger hos någon annan. Följ upp i tid – utan att behöva hålla det i huvudet."
        actions={<Button variant="primary" onClick={() => openCapture("Väntar på ")}>+ Väntar på</Button>}
      />
      {waiting.length === 0 ? (
        <EmptyState title="Du väntar inte på något" text="Skriv till exempel ”Väntar på Martin ska skicka avtalet” i Fånga." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {waiting.map((item) => (
            <WaitingCard key={item.id} item={item} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <Section title="Nyligen mottaget" className="mt-12">
          <div className="space-y-1 text-sm text-ink-3">
            {done.map((i) => (
              <p key={i.id} className="line-through">
                {i.title} {i.waitingFor && `– ${i.waitingFor}`}
              </p>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function WaitingCard({ item }: { item: NavetItem }) {
  const { updateItem, openItem, projectById, notify } = useNavet();
  const since = item.lastFollowUp ? -daysFromToday(item.lastFollowUp) : null;
  const stale = since !== null && since >= 5;

  return (
    <Card className="flex flex-col p-5">
      <button onClick={() => openItem(item)} className="text-left">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Väntar på</p>
        <p className="mt-1 text-xl font-semibold">{item.waitingFor ?? "Okänd person"}</p>
        <p className="mt-2 text-[15px] text-ink-2">{item.title}</p>
      </button>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-ink-3">Senast</dt>
          <dd className="mt-1">{item.dueDate ? <DueBadge date={item.dueDate} overdue={isOverdue(item)} /> : <span className="text-ink-3">–</span>}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Senaste uppföljning</dt>
          <dd className={stale ? "mt-1 text-warn" : "mt-1 text-ink-2"}>
            {item.lastFollowUp ? (since === 0 ? "Idag" : `${formatDue(item.lastFollowUp)} (${since} d)`) : "Inte uppföljd"}
          </dd>
        </div>
      </dl>
      <div className="mt-3">
        <ProjectBadge project={projectById(item.projectId)} />
      </div>
      <div className="mt-auto flex gap-2 pt-4">
        <Button
          size="sm"
          onClick={async () => {
            await updateItem(item.id, { lastFollowUp: todayISO() });
            notify("Uppföljning registrerad");
          }}
        >
          <MessageCircle className="size-4" /> Följt upp idag
        </Button>
        <Button size="sm" variant="ghost" onClick={() => updateItem(item.id, { status: "done" })}>
          <Check className="size-4" /> Mottaget
        </Button>
      </div>
    </Card>
  );
}
