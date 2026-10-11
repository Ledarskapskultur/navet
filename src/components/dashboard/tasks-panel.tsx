"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { ItemList } from "@/components/item-row";
import { Button, EmptyState, Section, SegmentedTabs } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { byDue, isActionable, mostImportant } from "@/lib/selectors";

type Tab = "important" | "todo" | "doing" | "done";

const LIMIT = 6;

/** Uppgifter: what matters most today, plus Att göra · Pågår · Klart. */
export function TasksPanel({ className }: { className?: string }) {
  const { items, openCapture } = useNavet();
  const [tab, setTab] = useState<Tab>("important");
  const today = todayISO();

  const actionable = items.filter(isActionable);
  const lists = {
    important: mostImportant(items, 5, today),
    todo: actionable.filter((i) => i.status !== "in_progress").sort(byDue),
    doing: actionable.filter((i) => i.status === "in_progress").sort(byDue),
    done: items
      .filter((i) => i.status === "done" && (i.type === "task" || i.type === "reminder" || i.type === "commitment"))
      .sort((a, b) => ((a.completedAt ?? a.updatedAt) < (b.completedAt ?? b.updatedAt) ? 1 : -1)),
  };
  const shown = lists[tab];

  const empty: Record<Tab, { title: string; text: string }> = {
    important: { title: "Inget brådskande", text: "Inga försenade eller prioriterade saker. Bra jobbat." },
    todo: { title: "Inget att göra", text: "Fånga det som snurrar i huvudet, så hamnar det här." },
    doing: { title: "Inget pågår", text: "Tryck på Påbörja på en uppgift när du sätter igång med den." },
    done: { title: "Inget klart än", text: "Det du bockar av hamnar här." },
  };

  return (
    <Section
      className={className}
      title="Uppgifter"
      action={
        <Link href="/att-gora" className="flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
          Alla uppgifter <ArrowRight className="size-4" />
        </Link>
      }
    >
      <div className="mb-3">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "important", label: "Viktigast idag", count: lists.important.length },
            { value: "todo", label: "Att göra", count: lists.todo.length },
            { value: "doing", label: "Pågår", count: lists.doing.length },
            { value: "done", label: "Klart" },
          ]}
        />
      </div>
      <ItemList
        items={shown.slice(0, LIMIT)}
        empty={
          <EmptyState
            title={empty[tab].title}
            text={empty[tab].text}
            action={tab === "done" || tab === "doing" ? undefined : <Button onClick={() => openCapture()}>+ Fånga något</Button>}
          />
        }
      />
      {shown.length > LIMIT && (
        <p className="mt-2 px-1 text-sm text-ink-3">
          Visar {LIMIT} av {shown.length}.{" "}
          <Link href="/att-gora" className="text-ink-2 underline underline-offset-2 hover:text-ink">
            Visa alla
          </Link>
        </p>
      )}
    </Section>
  );
}
