"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Sparkles } from "lucide-react";
import { parseCapture } from "@/lib/parser";
import { ITEM_TYPES, type ItemType } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/labels";
import { formatDue } from "@/lib/dates";
import { useNavet } from "./navet-provider";
import { Button, Field, inputClass, Modal } from "./ui";
import { GoogleTasksIcon, TypeIcon } from "./icons";

const EXAMPLES = ["Ring Johan på torsdag", "Idé till UGL: gör en sida för HR", "Jag lovade Anna att skicka presentationen på fredag", "Väntar på Martin ska skicka avtalet"];

type Override = Partial<{ type: ItemType; title: string; dueDate: string | null; dueTime: string | null; projectId: string | null; person: string | null; waitingFor: string | null }>;

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export function CaptureDialog() {
  const { captureOpen, closeCapture, captureInitial } = useNavet();
  return (
    <Modal open={captureOpen} onClose={closeCapture} title="Fånga">
      {captureOpen && <CaptureBody initial={captureInitial} />}
    </Modal>
  );
}

function CaptureBody({ initial }: { initial: string }) {
  const { projects, sync, createItem, closeCapture, notify, status } = useNavet();
  const [text, setText] = useState(initial);
  const [override, setOverride] = useState<Override>({});
  const [sortNow, setSortNow] = useState(false);
  const [listening, setListening] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const lists = sync?.lists ?? [];
  const [listId, setListId] = useState(sync?.defaultListId ?? lists[0]?.id ?? "");
  const [googleChoice, setGoogleChoice] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = useMemo(() => !!getSpeechRecognition(), []);

  useEffect(() => inputRef.current?.focus(), []);

  const parsed = useMemo(() => parseCapture(text, projects), [text, projects]);
  const result = { ...parsed, ...override };
  const project = projects.find((p) => p.id === result.projectId);
  const googleDefault = lists.length > 0 && (result.type === "task" || result.type === "reminder" || result.type === "commitment");
  const syncToGoogle = googleChoice ?? googleDefault;

  const onText = (v: string) => {
    setText(v);
    setOverride((o) => {
      // keep manual choices except title, which follows the text
      const { title: _title, ...rest } = o;
      void _title;
      return rest;
    });
  };

  const toggleVoice = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const SR = getSpeechRecognition();
    if (!SR) return;
    const rec = new SR();
    rec.lang = "sv-SE";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      onText(transcript);
      setUsedVoice(true);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const save = async () => {
    if (!result.title.trim() || saving) return;
    setSaving(true);
    const status = sortNow ? (result.type === "waiting" ? "waiting" : "open") : "inbox";
    const created = await createItem(
      {
        title: result.title,
        type: result.type,
        status,
        source: usedVoice ? "voice" : "manual",
        projectId: result.projectId,
        dueDate: result.dueDate,
        dueTime: result.dueTime,
        person: result.person,
        waitingFor: result.waitingFor,
        priority: parsed.priority,
      },
      syncToGoogle ? { syncToGoogle: true, listId } : {},
    );
    setSaving(false);
    if (created) {
      notify(syncToGoogle ? `Fångad – även i Google Tasks` : sortNow ? "Sparad" : "Sparad i inkorgen");
      closeCapture();
    }
  };

  return (
    <div className="space-y-5 pb-2 pt-1">
      <div className="relative">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void save();
            }
          }}
          rows={2}
          placeholder="Vad vill du komma ihåg?"
          className="w-full resize-none rounded-2xl border border-line bg-canvas px-4 py-3.5 pr-12 text-lg leading-snug text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {speechSupported && (
          <button
            onClick={toggleVoice}
            aria-label={listening ? "Sluta lyssna" : "Tala in"}
            className={clsx(
              "absolute right-3 top-3 rounded-xl p-2 transition-colors",
              listening ? "bg-accent text-white" : "text-ink-3 hover:bg-subtle hover:text-ink",
            )}
          >
            {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>
        )}
      </div>

      {!text && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => onText(ex)} className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 hover:bg-subtle">
              {ex}
            </button>
          ))}
        </div>
      )}

      {text.trim() && (
        <div className="animate-in rounded-2xl border border-line bg-canvas/70 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-3">
            <Sparkles className="size-3.5" /> Navets tolkning
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {ITEM_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setOverride((o) => ({ ...o, type: t }))}
                className={clsx(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                  result.type === t ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink-2 hover:bg-subtle",
                )}
              >
                <TypeIcon type={t} className="size-3.5" />
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <input
            value={result.title}
            onChange={(e) => setOverride((o) => ({ ...o, title: e.target.value }))}
            className={clsx(inputClass, "mb-3 font-medium")}
            aria-label="Titel"
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Datum">
              <input
                type="date"
                className={inputClass}
                value={result.dueDate ?? ""}
                onChange={(e) => setOverride((o) => ({ ...o, dueDate: e.target.value || null }))}
              />
            </Field>
            <Field label="Projekt">
              <select
                className={inputClass}
                value={result.projectId ?? ""}
                onChange={(e) => setOverride((o) => ({ ...o, projectId: e.target.value || null }))}
              >
                <option value="">Inget projekt</option>
                {projects.filter((p) => !p.archived).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            {result.type === "waiting" ? (
              <Field label="Väntar på">
                <input className={inputClass} value={result.waitingFor ?? ""} onChange={(e) => setOverride((o) => ({ ...o, waitingFor: e.target.value || null }))} />
              </Field>
            ) : (
              <Field label={result.type === "commitment" ? "Lovat till" : "Person"}>
                <input className={inputClass} value={result.person ?? ""} onChange={(e) => setOverride((o) => ({ ...o, person: e.target.value || null }))} />
              </Field>
            )}
            <Field label="Tid">
              <input type="time" className={inputClass} value={result.dueTime ?? ""} onChange={(e) => setOverride((o) => ({ ...o, dueTime: e.target.value || null }))} />
            </Field>
          </div>

          <p className="mt-3 text-sm text-ink-2">
            {TYPE_LABEL[result.type]}
            {result.dueDate && <> · {formatDue(result.dueDate, result.dueTime)}</>}
            {project && <> · {project.name}</>}
            {parsed.priority === "high" && <> · Hög prioritet</>}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <label className="flex items-center gap-2.5 text-sm text-ink-2">
          <input type="checkbox" checked={sortNow} onChange={(e) => setSortNow(e.target.checked)} className="size-4 accent-[#2f5d4e]" />
          Hoppa över inkorgen (redan sorterad)
        </label>
        {lists.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 text-sm text-ink-2">
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={syncToGoogle} onChange={(e) => setGoogleChoice(e.target.checked)} className="size-4 accent-[#2f5d4e]" />
              <GoogleTasksIcon className="size-4" />
              Synka till Google Tasks{status?.mode === "demo" ? " (demo)" : ""}
            </label>
            {syncToGoogle && (
              <select value={listId} onChange={(e) => setListId(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 text-sm">
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="hidden text-xs text-ink-3 sm:block">Enter sparar · Esc stänger</p>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={closeCapture}>Avbryt</Button>
          <Button variant="primary" onClick={save} disabled={!result.title.trim() || saving}>
            {saving ? "Sparar…" : "Spara"}
          </Button>
        </div>
      </div>
    </div>
  );
}
