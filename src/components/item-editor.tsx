"use client";

import { useState } from "react";
import { FolderPlus, Link2Off, StickyNote, CircleCheck, Trash2 } from "lucide-react";
import { ITEM_STATUSES, ITEM_TYPES, PRIORITIES, REQUEST_STAGES, type ItemPatch, type NavetItem, type RequestStage } from "@/lib/types";
import { PRIORITY_LABEL, STAGE_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/labels";
import { stagePatch } from "@/lib/request-stage";
import { relativeTime } from "@/lib/dates";
import { useNavet } from "./navet-provider";
import { Button, Field, inputClass, Modal, SourceBadge } from "./ui";
import { GoogleTasksIcon } from "./icons";

type Form = Pick<
  NavetItem,
  | "title" | "description" | "type" | "status" | "projectId" | "dueDate" | "dueTime" | "priority"
  | "estimatedTime" | "waitingFor" | "person" | "lastFollowUp" | "stage" | "eventDate" | "contact"
>;

const pick = (i: NavetItem): Form => ({
  title: i.title,
  description: i.description,
  type: i.type,
  status: i.status,
  projectId: i.projectId,
  dueDate: i.dueDate,
  dueTime: i.dueTime,
  priority: i.priority,
  estimatedTime: i.estimatedTime,
  waitingFor: i.waitingFor,
  person: i.person,
  lastFollowUp: i.lastFollowUp,
  stage: i.stage,
  eventDate: i.eventDate,
  contact: i.contact,
});

export function ItemEditor() {
  const { editing, closeItem } = useNavet();
  return (
    <Modal open={!!editing} onClose={closeItem} title="Redigera" wide>
      {editing && <EditorBody key={editing.id} item={editing} />}
    </Modal>
  );
}

function EditorBody({ item }: { item: NavetItem }) {
  const { updateItem, deleteItem, unlinkItem, closeItem, projects, sync, status, listName, createProject, notify } = useNavet();
  const [form, setForm] = useState<Form>(() => pick(item));
  const [listId, setListId] = useState<string>(item.externalListId ?? sync?.defaultListId ?? sync?.lists[0]?.id ?? "");
  const [pushToGoogle, setPushToGoogle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteExternal, setDeleteExternal] = useState(true);
  const [saving, setSaving] = useState(false);
  const linked = item.externalProvider === "google_tasks" && !!item.externalId;
  const lists = sync?.lists ?? [];

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (extra: ItemPatch = {}) => {
    const patch: ItemPatch = {};
    const merged = { ...form, ...extra } as Form;
    for (const k of Object.keys(merged) as (keyof Form)[]) {
      if (JSON.stringify(merged[k] ?? null) !== JSON.stringify(item[k] ?? null)) (patch as Record<string, unknown>)[k] = merged[k];
    }
    const moving = linked && listId && listId !== item.externalListId;
    if (moving) patch.externalListId = listId;
    if (!Object.keys(patch).length && !pushToGoogle) return closeItem();
    setSaving(true);
    const res = await updateItem(item.id, patch, pushToGoogle ? { syncToGoogle: true, listId } : {});
    setSaving(false);
    if (res) {
      if (moving) notify(`Flyttad till ${listName(listId) ?? "ny lista"} i Google Tasks`);
      else if (linked || pushToGoogle) notify("Sparad och synkad med Google Tasks");
      closeItem();
    }
  };

  const convertToProject = async () => {
    const p = await createProject(item.title, item.description ?? undefined);
    if (p) {
      await updateItem(item.id, { status: "archived", projectId: p.id });
      notify(`Projektet ”${p.name}” skapades`);
      closeItem();
    }
  };

  return (
    <div className="space-y-5 pt-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <SourceBadge source={item.source} listName={linked ? listName(item.externalListId) : null} />
        <span>Skapad {relativeTime(item.createdAt)}</span>
        <span>· Uppdaterad {relativeTime(item.updatedAt)}</span>
      </div>

      <textarea
        value={form.title}
        rows={2}
        onChange={(e) => set("title", e.target.value.replace(/\n/g, " "))}
        className="w-full resize-none border-0 bg-transparent p-0 text-xl font-semibold leading-snug text-ink placeholder:text-ink-3 focus:outline-none focus:ring-0"
        placeholder="Titel"
        aria-label="Titel"
      />
      <textarea
        value={form.description ?? ""}
        onChange={(e) => set("description", e.target.value || null)}
        rows={3}
        placeholder="Beskrivning eller anteckningar…"
        className={`${inputClass} h-auto py-2.5`}
      />

      {item.type === "idea" && (
        <div className="rounded-2xl bg-subtle p-4">
          <p className="mb-3 text-sm font-medium text-ink">Konvertera idén</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => save({ type: "task", status: "open" })}>
              <CircleCheck className="size-4" /> Till uppgift
            </Button>
            <Button size="sm" onClick={() => save({ type: "note", status: "open" })}>
              <StickyNote className="size-4" /> Till anteckning
            </Button>
            <Button size="sm" onClick={convertToProject}>
              <FolderPlus className="size-4" /> Till projekt
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Typ">
          <select className={inputClass} value={form.type} onChange={(e) => set("type", e.target.value as Form["type"])}>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => set("status", e.target.value as Form["status"])}>
            {ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Projekt">
          <select className={inputClass} value={form.projectId ?? ""} onChange={(e) => set("projectId", e.target.value || null)}>
            <option value="">Inget projekt</option>
            {projects.filter((p) => !p.archived).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Datum">
          <input type="date" className={inputClass} value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value || null)} />
        </Field>
        <Field label="Tid">
          <input type="time" className={inputClass} value={form.dueTime ?? ""} onChange={(e) => set("dueTime", e.target.value || null)} />
        </Field>
        <Field label="Prioritet">
          <select className={inputClass} value={form.priority} onChange={(e) => set("priority", e.target.value as Form["priority"])}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
        </Field>
        <Field label="Tidsåtgång (min)">
          <input
            type="number"
            min={0}
            step={5}
            className={inputClass}
            value={form.estimatedTime ?? ""}
            onChange={(e) => set("estimatedTime", e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
        <Field label={form.type === "commitment" ? "Lovat till" : "Person"}>
          <input className={inputClass} value={form.person ?? ""} onChange={(e) => set("person", e.target.value || null)} placeholder="Namn" />
        </Field>
        {(form.type === "waiting" || form.status === "waiting" || form.waitingFor) && (
          <>
            <Field label="Väntar på">
              <input className={inputClass} value={form.waitingFor ?? ""} onChange={(e) => set("waitingFor", e.target.value || null)} placeholder="Person" />
            </Field>
            <Field label="Senaste uppföljning">
              <input type="date" className={inputClass} value={form.lastFollowUp ?? ""} onChange={(e) => set("lastFollowUp", e.target.value || null)} />
            </Field>
          </>
        )}
      </div>

      {form.type === "request" && (
        <div className="rounded-2xl border border-line p-4">
          <p className="mb-3 text-sm font-medium">Förfrågan</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Läge">
              <select
                className={inputClass}
                value={form.stage ?? "new"}
                onChange={(e) => {
                  const p = stagePatch(e.target.value as RequestStage);
                  setForm((f) => ({ ...f, stage: p.stage!, status: p.status! }));
                }}
              >
                {REQUEST_STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field label="Önskat datum">
              <input type="date" className={inputClass} value={form.eventDate ?? ""} onChange={(e) => set("eventDate", e.target.value || null)} />
            </Field>
            {(["name", "organization", "email", "phone"] as const).map((k) => (
              <Field key={k} label={{ name: "Kontaktperson", organization: "Organisation", email: "E-post", phone: "Telefon" }[k]}>
                <input
                  className={inputClass}
                  type={k === "email" ? "email" : k === "phone" ? "tel" : "text"}
                  value={form.contact?.[k] ?? ""}
                  onChange={(e) =>
                    set("contact", {
                      ...(form.contact ?? { name: null, email: null, phone: null, organization: null }),
                      [k]: e.target.value || null,
                    })
                  }
                />
              </Field>
            ))}
          </div>
        </div>
      )}

      {/* Google Tasks */}
      {status?.googleEnabled && (
      <div className="rounded-2xl border border-line p-4">
        <div className="mb-3 flex items-center gap-2">
          <GoogleTasksIcon className="size-4" />
          <p className="text-sm font-medium">Google Tasks</p>
          {status?.mode === "demo" && <span className="text-xs text-ink-3">(demoläge)</span>}
        </div>
        {linked ? (
          <div className="space-y-3">
            <Field label="Lista">
              <select className={inputClass} value={listId} onChange={(e) => setListId(e.target.value)}>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </Field>
            <p className="text-xs leading-relaxed text-ink-3">
              Titel, beskrivning, datum och klar-status synkas till Google. Typ, projekt, tid och prioritet finns bara i Navet.
            </p>
            <Button size="sm" variant="ghost" onClick={() => unlinkItem(item.id)}>
              <Link2Off className="size-4" /> Koppla bort från Google
            </Button>
          </div>
        ) : lists.length ? (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pushToGoogle} onChange={(e) => setPushToGoogle(e.target.checked)} className="size-4 accent-[#2f5d4e]" />
              Skapa i Google Tasks när jag sparar
            </label>
            {pushToGoogle && (
              <select className={inputClass} value={listId} onChange={(e) => setListId(e.target.value)}>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-3">Synka med Google Tasks för att kunna koppla objektet.</p>
        )}
      </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-3">
            {linked && (
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={deleteExternal} onChange={(e) => setDeleteExternal(e.target.checked)} className="size-4 accent-[#9a4f2c]" />
                Radera även i Google Tasks
              </label>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                closeItem();
                await deleteItem(item.id, { deleteExternal });
              }}
            >
              Bekräfta radering
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Avbryt
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="self-start text-warn hover:bg-warn-soft hover:text-warn" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Radera
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={closeItem}>Avbryt</Button>
          <Button variant="primary" disabled={saving || !form.title.trim()} onClick={() => save()}>
            {saving ? "Sparar…" : "Spara"}
          </Button>
        </div>
      </div>
    </div>
  );
}
