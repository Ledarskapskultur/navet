"use client";

import Link from "next/link";
import { useState } from "react";
import { useNavet } from "@/components/navet-provider";
import { Button, Card, PageHeader, inputClass } from "@/components/ui";
import { isActive } from "@/lib/selectors";
import { relativeTime } from "@/lib/dates";

export default function ProjectsPage() {
  const { items, projects, createProject } = useNavet();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <PageHeader
        title="Projekt"
        subtitle="Dina ansvarsområden. Varje projekt samlar uppgifter, idéer, åtaganden och det du väntar på."
        actions={<Button variant="primary" onClick={() => setAdding(true)}>+ Nytt projekt</Button>}
      />
      {adding && (
        <form
          className="mb-6 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await createProject(name.trim());
            setName("");
            setAdding(false);
          }}
        >
          <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Projektnamn" />
          <Button variant="primary" type="submit">Skapa</Button>
          <Button variant="ghost" type="button" onClick={() => setAdding(false)}>Avbryt</Button>
        </form>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {projects
          .filter((p) => !p.archived)
          .map((p) => {
            const pi = items.filter((i) => i.projectId === p.id);
            const active = pi.filter(isActive);
            const count = (t: string) => active.filter((i) => i.type === t).length;
            const tasks = active.filter((i) => i.type === "task" || i.type === "reminder").length;
            const last = pi.reduce<string | null>((m, i) => (!m || i.updatedAt > m ? i.updatedAt : m), null);
            return (
              <Link key={p.id} href={`/projekt/${p.id}`}>
                <Card className="h-full p-5 transition-colors hover:border-line-strong">
                  <div className="flex items-center gap-3">
                    <span className="size-3 rounded-full" style={{ background: p.color }} />
                    <h2 className="text-lg font-semibold">{p.name}</h2>
                    <span className="ml-auto text-sm tabular-nums text-ink-3">{active.length} aktiva</span>
                  </div>
                  {p.description && <p className="mt-2 text-sm text-ink-2">{p.description}</p>}
                  <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
                    {[
                      ["Uppgifter", tasks],
                      ["Idéer", count("idea")],
                      ["Åtaganden", count("commitment")],
                      ["Väntar", count("waiting")],
                    ].map(([label, n]) => (
                      <div key={label} className="rounded-xl bg-canvas py-2.5">
                        <dd className="text-lg font-semibold tabular-nums">{n}</dd>
                        <dt className="text-[11px] text-ink-3">{label}</dt>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-xs text-ink-3">Senaste aktivitet {relativeTime(last)}</p>
                </Card>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
