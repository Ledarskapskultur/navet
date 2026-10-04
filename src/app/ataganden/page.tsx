"use client";

import { useNavet } from "@/components/navet-provider";
import { ItemList } from "@/components/item-row";
import { Button, EmptyState, PageHeader, Section } from "@/components/ui";
import { byDue, isActive } from "@/lib/selectors";

export default function CommitmentsPage() {
  const { items, openCapture } = useNavet();
  const all = items.filter((i) => i.type === "commitment");
  const active = all.filter(isActive).sort(byDue);
  const kept = all.filter((i) => i.status === "done").slice(0, 8);
  const people = Array.from(new Set(active.map((i) => i.person).filter(Boolean))) as string[];

  return (
    <div>
      <PageHeader
        title="Åtaganden"
        subtitle="Det du har lovat andra. Ett hållet löfte bygger förtroende – här ser du vad som väntar på dig."
        actions={<Button variant="primary" onClick={() => openCapture("Jag lovade ")}>+ Nytt åtagande</Button>}
      />
      {people.length > 0 && (
        <p className="mb-8 text-[15px] text-ink-2">
          Du har lovat saker till <span className="font-medium text-ink">{people.join(", ")}</span>.
        </p>
      )}
      <Section title="Att hålla" count={active.length}>
        <ItemList
          items={active}
          showType={false}
          empty={<EmptyState title="Inga öppna åtaganden" text="Skriv ”Jag lovade Anna att …” i Fånga så hamnar det här." />}
        />
      </Section>
      {kept.length > 0 && (
        <Section title="Hållna löften" count={kept.length}>
          <ItemList items={kept} showType={false} />
        </Section>
      )}
    </div>
  );
}
