"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { ItemList } from "@/components/item-row";
import { Button, EmptyState, PageHeader, Section, inputClass } from "@/components/ui";
import { byDue, isActive } from "@/lib/selectors";
import { relativeTime } from "@/lib/dates";
import { TYPE_LABEL } from "@/lib/labels";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { items, projectById, openCapture, updateProject, deleteProject, openItem } = useNavet();
  const project = projectById(id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");

  if (!project) {
    return <EmptyState title="Projektet finns inte" action={<Link href="/projekt" className="underline">Till projekt</Link>} />;
  }

  const pi = items.filter((i) => i.projectId === project.id);
  const active = pi.filter(isActive).sort(byDue);
  const tasks = active.filter((i) => i.type === "task" || i.type === "reminder");
  const ideas = active.filter((i) => i.type === "idea");
  const commitments = active.filter((i) => i.type === "commitment");
  const waiting = active.filter((i) => i.type === "waiting");
  const notes = active.filter((i) => i.type === "note");
  const recent = [...pi].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 6);

  return (
    <div>
      <Link href="/projekt" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Projekt
      </Link>
      {editing ? (
        <form
          className="mb-8 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await updateProject(project.id, { name: name.trim() || project.name, description: description || null });
            setEditing(false);
          }}
        >
          <input className={`${inputClass} text-lg font-semibold`} value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className={`${inputClass} h-auto py-2`} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Beskrivning" />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" type="submit">Spara</Button>
            <Button variant="ghost" type="button" onClick={() => setEditing(false)}>Avbryt</Button>
            <Button
              variant="danger"
              type="button"
              className="ml-auto"
              onClick={async () => {
                if (!confirm(`Radera projektet ”${project.name}”? Objekten finns kvar utan projekt.`)) return;
                await deleteProject(project.id);
                router.push("/projekt");
              }}
            >
              Radera projekt
            </Button>
          </div>
        </form>
      ) : (
        <PageHeader
          title={project.name}
          subtitle={project.description ?? undefined}
          actions={
            <>
              <Button variant="ghost" onClick={() => setEditing(true)}>Redigera</Button>
              <Button variant="primary" onClick={() => openCapture(`${project.aliases[0] ?? project.name}: `)}>+ Fånga till projektet</Button>
            </>
          }
        />
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <Section title="Öppna uppgifter" count={tasks.length}>
            <ItemList items={tasks} showProject={false} empty={<EmptyState title="Inga öppna uppgifter" />} />
          </Section>
          {commitments.length > 0 && (
            <Section title="Åtaganden" count={commitments.length}>
              <ItemList items={commitments} showProject={false} showType={false} />
            </Section>
          )}
          {waiting.length > 0 && (
            <Section title="Väntar på" count={waiting.length}>
              <ItemList items={waiting} showProject={false} showType={false} />
            </Section>
          )}
          {ideas.length > 0 && (
            <Section title="Idéer" count={ideas.length}>
              <ItemList items={ideas} showProject={false} showType={false} />
            </Section>
          )}
          {notes.length > 0 && (
            <Section title="Anteckningar" count={notes.length}>
              <ItemList items={notes} showProject={false} showType={false} />
            </Section>
          )}
        </div>
        <aside>
          <Section title="Senaste aktivitet">
            <ol className="space-y-3">
              {recent.map((i) => (
                <li key={i.id}>
                  <button onClick={() => openItem(i)} className="text-left">
                    <p className="text-sm text-ink">{i.title}</p>
                    <p className="text-xs text-ink-3">
                      {TYPE_LABEL[i.type]} · {i.status === "done" ? "klar" : "uppdaterad"} {relativeTime(i.updatedAt)}
                    </p>
                  </button>
                </li>
              ))}
              {!recent.length && <p className="text-sm text-ink-3">Ingen aktivitet ännu.</p>}
            </ol>
          </Section>
        </aside>
      </div>
    </div>
  );
}
