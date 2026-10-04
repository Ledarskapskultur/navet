"use client";

import { useState } from "react";
import { CircleCheck, FolderPlus, StickyNote } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Card, EmptyState, PageHeader, ProjectBadge, SegmentedTabs } from "@/components/ui";
import { byNewest, isActive } from "@/lib/selectors";
import { relativeTime } from "@/lib/dates";
import type { NavetItem } from "@/lib/types";

export default function IdeasPage() {
  const { items, openCapture } = useNavet();
  const [tab, setTab] = useState<"ideas" | "notes">("ideas");
  const ideas = items.filter((i) => i.type === "idea" && isActive(i)).sort(byNewest);
  const notes = items.filter((i) => i.type === "note" && isActive(i)).sort(byNewest);
  const list = tab === "ideas" ? ideas : notes;

  return (
    <div>
      <PageHeader
        title="Idéer"
        subtitle="Tankar som ännu inte är uppgifter. Låt dem mogna – och gör om dem till uppgift, projekt eller anteckning när det är dags."
        actions={<Button variant="primary" onClick={() => openCapture("Idé: ")}>+ Ny idé</Button>}
      />
      <div className="mb-6">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "ideas", label: "Idéer", count: ideas.length },
            { value: "notes", label: "Anteckningar", count: notes.length },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <EmptyState title={tab === "ideas" ? "Inga idéer ännu" : "Inga anteckningar"} text="Skriv ”Idé till UGL: …” i Fånga." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((item) => (
            <IdeaCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function IdeaCard({ item }: { item: NavetItem }) {
  const { updateItem, openItem, projectById, createProject, notify } = useNavet();
  const toProject = async () => {
    const p = await createProject(item.title, item.description ?? undefined);
    if (p) {
      await updateItem(item.id, { status: "archived", projectId: p.id });
      notify(`Projektet ”${p.name}” skapades`);
    }
  };
  return (
    <Card className="flex flex-col p-5">
      <button onClick={() => openItem(item)} className="text-left">
        <p className="text-[17px] font-medium leading-snug">{item.title}</p>
        {item.description && <p className="mt-2 line-clamp-3 text-sm text-ink-2">{item.description}</p>}
      </button>
      <div className="mt-3 flex items-center gap-3 text-xs text-ink-3">
        <ProjectBadge project={projectById(item.projectId)} />
        <span>{relativeTime(item.createdAt)}</span>
      </div>
      {item.type === "idea" && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
          <Button size="sm" variant="ghost" onClick={() => updateItem(item.id, { type: "task", status: "open" }).then((r) => r && notify("Idén är nu en uppgift"))}>
            <CircleCheck className="size-4" /> Uppgift
          </Button>
          <Button size="sm" variant="ghost" onClick={toProject}>
            <FolderPlus className="size-4" /> Projekt
          </Button>
          <Button size="sm" variant="ghost" onClick={() => updateItem(item.id, { type: "note", status: "open" }).then((r) => r && notify("Sparad som anteckning"))}>
            <StickyNote className="size-4" /> Anteckning
          </Button>
        </div>
      )}
    </Card>
  );
}
