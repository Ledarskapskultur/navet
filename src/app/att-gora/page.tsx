"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useNavet } from "@/components/navet-provider";
import { ItemList } from "@/components/item-row";
import { Button, EmptyState, PageHeader, Section, SegmentedTabs } from "@/components/ui";
import { addDaysISO, todayISO } from "@/lib/dates";
import { byDue, isActionable } from "@/lib/selectors";
import { ITEM_SOURCES, PRIORITIES, type NavetItem } from "@/lib/types";
import { PRIORITY_LABEL, SOURCE_LABEL } from "@/lib/labels";

type Filter = "all" | "today" | "upcoming" | "overdue" | "nodate";

const selectClass = "h-9 rounded-xl border border-line bg-surface px-3 text-sm text-ink-2";

function TodoView() {
  const { items, projects, openCapture } = useNavet();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get("filter") as Filter) || "all");
  const [project, setProject] = useState("");
  const [priority, setPriority] = useState("");
  const [source, setSource] = useState("");
  const today = todayISO();

  const base = items
    .filter(isActionable)
    .filter((i) => !project || (project === "none" ? !i.projectId : i.projectId === project))
    .filter((i) => !priority || i.priority === priority)
    .filter((i) => !source || i.source === source)
    .sort(byDue);

  const groups = {
    overdue: base.filter((i) => i.dueDate && i.dueDate < today),
    today: base.filter((i) => i.dueDate === today),
    upcoming: base.filter((i) => i.dueDate && i.dueDate > today),
    nodate: base.filter((i) => !i.dueDate),
  };
  const weekEnd = addDaysISO(today, 7);

  const sections: { key: Exclude<Filter, "all">; title: string; items: NavetItem[] }[] = [
    { key: "overdue", title: "Försenade", items: groups.overdue },
    { key: "today", title: "Idag", items: groups.today },
    { key: "upcoming", title: "Kommande 7 dagar", items: groups.upcoming.filter((i) => i.dueDate! <= weekEnd) },
    { key: "upcoming", title: "Senare", items: groups.upcoming.filter((i) => i.dueDate! > weekEnd) },
    { key: "nodate", title: "Utan datum", items: groups.nodate },
  ];
  const visible = sections.filter((s) => (filter === "all" || s.key === filter) && s.items.length);

  return (
    <div>
      <PageHeader
        title="Att göra"
        subtitle="Alla aktiva uppgifter, påminnelser och åtaganden – oavsett om de skapats i Navet eller i Google Tasks."
        actions={<Button variant="primary" onClick={() => openCapture()}>+ Ny uppgift</Button>}
      />
      <div className="mb-8 space-y-3">
        <SegmentedTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Alla", count: base.length },
            { value: "today", label: "Idag", count: groups.today.length },
            { value: "upcoming", label: "Kommande", count: groups.upcoming.length },
            { value: "overdue", label: "Försenade", count: groups.overdue.length },
            { value: "nodate", label: "Utan datum", count: groups.nodate.length },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <select className={selectClass} value={project} onChange={(e) => setProject(e.target.value)} aria-label="Projekt">
            <option value="">Alla projekt</option>
            <option value="none">Utan projekt</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Prioritet">
            <option value="">Alla prioriteter</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
          <select className={selectClass} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Källa">
            <option value="">Alla källor</option>
            {ITEM_SOURCES.map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Inget här" text="Inga uppgifter matchar filtret." />
      ) : (
        visible.map((s) => (
          <Section key={s.title} title={s.title} count={s.items.length}>
            <ItemList items={s.items} />
          </Section>
        ))
      )}
    </div>
  );
}

export default function TodoPage() {
  return (
    <Suspense>
      <TodoView />
    </Suspense>
  );
}
