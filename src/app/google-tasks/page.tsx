"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { Check, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Card, EmptyState, PageHeader, Pill, inputClass } from "@/components/ui";
import { GoogleTasksIcon } from "@/components/icons";
import { byDue } from "@/lib/selectors";
import { relativeTime } from "@/lib/dates";
import type { NavetItem } from "@/lib/types";

export default function GoogleTasksPage() {
  const { items, sync, syncing, syncNow, status, createItem, notify } = useNavet();
  const lists = sync?.lists ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const listId = selected && lists.some((l) => l.id === selected) ? selected : (lists[0]?.id ?? null);

  const linked = items.filter((i) => i.externalProvider === "google_tasks" && i.externalId);
  const inList = linked.filter((i) => i.externalListId === listId);
  const open = inList.filter((i) => i.status !== "done" && i.status !== "archived").sort(byDue);
  const done = inList.filter((i) => i.status === "done");

  if (status && !status.googleEnabled) {
    return (
      <div>
        <PageHeader title="Google Tasks" />
        <EmptyState
          title="Google Tasks är inte kopplat"
          text="Navet fungerar fullt ut utan Google. Vill du synka med Google Tasks senare kan du koppla det under Inställningar."
          action={<Link href="/installningar" className="text-sm font-medium text-accent underline underline-offset-2">Till Inställningar</Link>}
        />
      </div>
    );
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !listId) return;
    const res = await createItem({ title: title.trim(), dueDate: due || null, status: "open", type: "task" }, { syncToGoogle: true, listId });
    if (res) {
      setTitle("");
      setDue("");
      notify("Skapad i Google Tasks");
    }
  };

  return (
    <div>
      <PageHeader
        title="Google Tasks"
        subtitle={
          <>
            Navet är huvudsystemet – Google Tasks är en källa. Allt du gör här skickas direkt till Google, och nya uppgifter från
            Google (t.ex. via Gemini) hämtas in automatiskt.
          </>
        }
        actions={
          <Button variant="primary" onClick={() => syncNow()} disabled={syncing}>
            <RefreshCw className={clsx("size-4", syncing && "animate-spin")} /> Synka nu
          </Button>
        }
      />

      <Card className="mb-8 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <GoogleTasksIcon className="size-8" />
          <div>
            <p className="font-medium">
              {status?.mode === "google" ? `Ansluten som ${status.user?.email}` : "Demoläge – simulerad Google Tasks"}
            </p>
            <p className={clsx("text-sm", sync?.lastError ? "text-warn" : "text-ink-2")}>
              {sync?.lastError
                ? `Senaste synk misslyckades: ${sync.lastError}`
                : sync?.lastSyncAt
                  ? `Synkad med Google ${relativeTime(sync.lastSyncAt)} · ${linked.length} kopplade uppgifter`
                  : "Inte synkad än"}
            </p>
          </div>
        </div>
        {status?.mode !== "google" && (
          <Link href="/installningar" className="text-sm font-medium text-accent underline underline-offset-2">
            Koppla riktiga Google Tasks
          </Link>
        )}
      </Card>

      {lists.length === 0 ? (
        <EmptyState
          title="Inga listor hämtade ännu"
          text="Klicka på Synka nu för att hämta dina Google Tasks-listor."
          action={<Button onClick={() => syncNow()}>Synka nu</Button>}
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
            <p className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3 lg:block">Listor</p>
            {lists.map((l) => {
              const n = linked.filter((i) => i.externalListId === l.id && i.status !== "done" && i.status !== "archived").length;
              return (
                <button
                  key={l.id}
                  onClick={() => setSelected(l.id)}
                  className={clsx(
                    "flex h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-left text-[15px]",
                    l.id === listId ? "bg-surface font-medium shadow-card" : "text-ink-2 hover:bg-sunken/60",
                  )}
                >
                  <span className="flex-1 whitespace-nowrap">{l.title}</span>
                  <span className="text-xs tabular-nums text-ink-3">{n}</span>
                  {sync?.defaultListId === l.id && <Pill className="hidden h-5 bg-accent-soft px-1.5 text-[10px] text-accent lg:inline-flex">Standard</Pill>}
                </button>
              );
            })}
          </nav>

          <div>
            <form onSubmit={add} className="mb-4 flex flex-col gap-2 sm:flex-row">
              <input className={inputClass} placeholder={`Ny uppgift i ”${lists.find((l) => l.id === listId)?.title}”`} value={title} onChange={(e) => setTitle(e.target.value)} />
              <input type="date" className={clsx(inputClass, "sm:w-44")} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Datum" />
              <Button variant="primary" type="submit" disabled={!title.trim()}>Lägg till</Button>
            </form>

            {open.length === 0 ? (
              <EmptyState title="Listan är tom" text="Inga öppna uppgifter i den här listan." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                {open.map((i) => (
                  <GoogleTaskRow key={i.id} item={i} />
                ))}
              </div>
            )}

            {done.length > 0 && (
              <div className="mt-6">
                <button onClick={() => setShowDone((s) => !s)} className="text-sm text-ink-2 hover:text-ink">
                  {showDone ? "Dölj" : "Visa"} klara ({done.length})
                </button>
                {showDone && (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface/70">
                    {done.map((i) => (
                      <GoogleTaskRow key={i.id} item={i} />
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="mt-6 flex items-center gap-1.5 text-xs text-ink-3">
              <ExternalLink className="size-3.5" /> Google Tasks lagrar bara datum (inte klockslag). Typ, projekt och prioritet finns bara i Navet.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function GoogleTaskRow({ item }: { item: NavetItem }) {
  const { updateItem, toggleDone, deleteItem, sync, openItem, notify, listName } = useNavet();
  const [title, setTitle] = useState(item.title);
  const [confirm, setConfirm] = useState(false);
  const done = item.status === "done";

  const saveTitle = async () => {
    if (title.trim() && title.trim() !== item.title) {
      if (await updateItem(item.id, { title: title.trim() })) notify("Titel uppdaterad i Google Tasks");
    } else setTitle(item.title);
  };

  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          onClick={() => toggleDone(item)}
          aria-label={done ? "Markera som ej klar" : "Markera som klar"}
          className={clsx(
            "flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
            done ? "border-accent bg-accent text-white" : "border-line-strong text-transparent hover:border-accent hover:text-accent",
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={clsx(
            "min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] hover:border-line focus:border-accent focus:outline-none",
            done && "text-ink-3 line-through",
          )}
          aria-label="Titel"
        />
      </div>
      <div className="flex items-center gap-2 pl-9 sm:pl-0">
        <input
          type="date"
          value={item.dueDate ?? ""}
          onChange={(e) => updateItem(item.id, { dueDate: e.target.value || null })}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-sm text-ink-2"
          aria-label="Datum"
        />
        <select
          value={item.externalListId ?? ""}
          onChange={async (e) => {
            const target = e.target.value;
            if (await updateItem(item.id, { externalListId: target })) notify(`Flyttad till ${listName(target)}`);
          }}
          className="h-8 max-w-[130px] rounded-lg border border-line bg-surface px-2 text-sm text-ink-2"
          aria-label="Flytta till lista"
        >
          {(sync?.lists ?? []).map((l) => (
            <option key={l.id} value={l.id}>{l.title}</option>
          ))}
        </select>
        <button onClick={() => openItem(item)} className="h-8 rounded-lg px-2 text-sm text-ink-2 hover:bg-subtle">
          Mer
        </button>
        {confirm ? (
          <Button size="sm" variant="danger" onClick={() => deleteItem(item.id)}>Radera</Button>
        ) : (
          <button onClick={() => setConfirm(true)} className="rounded-lg p-1.5 text-ink-3 hover:bg-subtle hover:text-warn" aria-label="Radera">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
