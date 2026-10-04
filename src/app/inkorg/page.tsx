"use client";

import clsx from "clsx";
import { Check, Trash2 } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, EmptyState, PageHeader, SourceBadge, inputClass } from "@/components/ui";
import { TypeIcon } from "@/components/icons";
import { ITEM_TYPES, type NavetItem } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/labels";
import { byNewest } from "@/lib/selectors";
import { relativeTime } from "@/lib/dates";

export default function InboxPage() {
  const { items, openCapture } = useNavet();
  const inbox = items.filter((i) => i.status === "inbox").sort(byNewest);

  return (
    <div>
      <PageHeader
        title="Inkorg"
        subtitle="Allt nytt landar här först – från snabbfångst, röst och Google Tasks. Ge varje sak en typ, ett projekt och ett datum, och flytta den vidare."
        actions={<Button variant="primary" onClick={() => openCapture()}>+ Fånga</Button>}
      />
      {inbox.length === 0 ? (
        <EmptyState title="Inkorgen är tom" text="Allt är sorterat. Nya saker från Google Tasks hamnar här automatiskt." />
      ) : (
        <div className="space-y-3">
          {inbox.map((item) => (
            <TriageCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function TriageCard({ item }: { item: NavetItem }) {
  const { updateItem, deleteItem, openItem, projects, listName } = useNavet();
  const set = (patch: Partial<NavetItem>) => updateItem(item.id, patch);
  const file = () => updateItem(item.id, { status: item.type === "waiting" ? "waiting" : "open" });

  return (
    <div className="animate-in rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => openItem(item)} className="min-w-0 text-left">
          <p className="text-[17px] font-medium leading-snug">{item.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <SourceBadge source={item.source} listName={item.externalProvider ? listName(item.externalListId) : null} />
            {item.source !== "google_tasks" && item.externalProvider === "google_tasks" && (
              <SourceBadge source="google_tasks" listName={listName(item.externalListId)} />
            )}
            {(item.person || item.waitingFor) && <span>{item.waitingFor ? `Väntar på ${item.waitingFor}` : item.person}</span>}
            <span>{relativeTime(item.createdAt)}</span>
          </div>
        </button>
        <button onClick={() => deleteItem(item.id)} className="rounded-lg p-2 text-ink-3 hover:bg-subtle hover:text-warn" aria-label="Radera">
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {ITEM_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => set({ type: t })}
            className={clsx(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
              item.type === t ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-2 hover:bg-subtle",
            )}
          >
            <TypeIcon type={t} className="size-3.5" />
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_170px_auto]">
        <select className={inputClass} value={item.projectId ?? ""} onChange={(e) => set({ projectId: e.target.value || null })} aria-label="Projekt">
          <option value="">Inget projekt</option>
          {projects.filter((p) => !p.archived).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input type="date" className={inputClass} value={item.dueDate ?? ""} onChange={(e) => set({ dueDate: e.target.value || null })} aria-label="Deadline" />
        <div className="flex gap-2">
          <select
            className={clsx(inputClass, "sm:w-36")}
            value=""
            onChange={(e) => e.target.value && set({ status: e.target.value as NavetItem["status"] })}
            aria-label="Status"
          >
            <option value="">Status…</option>
            <option value="open">Aktiv</option>
            <option value="waiting">Väntar</option>
            <option value="done">Klar</option>
            <option value="archived">Arkivera</option>
          </select>
          <Button variant="primary" onClick={file} className="shrink-0">
            <Check className="size-4" /> Sorterad
          </Button>
        </div>
      </div>
    </div>
  );
}
