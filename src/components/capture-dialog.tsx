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
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e?: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export function CaptureDialog() {
  const { captureOpen, closeCapture, captureInitial, captureVoice } = useNavet();
  return (
    <Modal open={captureOpen} onClose={closeCapture} title="Fånga">
      {captureOpen && <CaptureBody initial={captureInitial} handsFree={captureVoice} />}
    </Modal>
  );
}

/** Seconds before a hands-free capture saves itself. Any touch cancels it. */
const AUTO_SAVE_SECONDS = 3;

function CaptureBody({ initial, handsFree }: { initial: string; handsFree: boolean }) {
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
  // Hands-free: countdown to auto-save after you stop talking (null = no countdown running).
  const [countdown, setCountdown] = useState<number | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const heardRef = useRef("");

  useEffect(() => {
    if (!handsFree) inputRef.current?.focus();
  }, [handsFree]);

  const parsed = useMemo(() => parseCapture(text, projects), [text, projects]);
  const result = { ...parsed, ...override };
  const project = projects.find((p) => p.id === result.projectId);
  const googleDefault = lists.length > 0 && (result.type === "task" || result.type === "reminder" || result.type === "commitment");
  const syncToGoogle = googleChoice ?? googleDefault;

  const onText = (v: string) => {
    setText(v);
    setCountdown(null);
    setOverride((o) => {
      // keep manual choices except title, which follows the text
      const { title: _title, ...rest } = o;
      void _title;
      return rest;
    });
  };

  const startListening = (autoSave: boolean) => {
    const SR = getSpeechRecognition();
    if (!SR) return;
    const rec = new SR();
    rec.lang = "sv-SE";
    rec.interimResults = true;
    rec.continuous = false;
    heardRef.current = "";
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      heardRef.current = transcript;
      setText(transcript);
      setOverride(({ title: _t, ...rest }) => (void _t, rest));
      setUsedVoice(true);
    };
    rec.onend = () => {
      setListening(false);
      if (autoSave && heardRef.current.trim()) setCountdown(AUTO_SAVE_SECONDS);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") setMicBlocked(true);
    };
    recRef.current = rec;
    setListening(true);
    setMicBlocked(false);
    try {
      rec.start();
    } catch {
      // Some browsers refuse to start without a tap; fall back to the mic button.
      setListening(false);
      setMicBlocked(true);
    }
  };

  const toggleVoice = () => {
    setCountdown(null);
    if (listening) {
      recRef.current?.stop();
      return;
    }
    startListening(handsFree);
  };

  // Hands-free launch ("Hey Google, öppna Navet" / "Tala in"-genvägen): start listening right away.
  useEffect(() => {
    // Deferred one tick so the dialog has rendered before the mic opens.
    const t = handsFree && speechSupported ? setTimeout(() => startListening(true), 0) : undefined;
    return () => {
      clearTimeout(t);
      recRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setCountdown(null);
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

  useEffect(() => {
    if (countdown === null) return;
    const t = setTimeout(() => {
      if (countdown <= 1) void save();
      else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  return (
    <div className="space-y-5 pb-2 pt-1" onPointerDown={() => countdown !== null && setCountdown(null)}>
      {handsFree && (listening || countdown !== null || micBlocked) && (
        <div
          role="status"
          className={clsx(
            "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm",
            micBlocked ? "bg-warn-soft text-warn" : "bg-accent-soft text-ink",
          )}
        >
          {micBlocked ? (
            <>Tryck på mikrofonen för att prata. Första gången frågar telefonen om lov att använda mikrofonen.</>
          ) : listening ? (
            <>
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-accent" />
              </span>
              Lyssnar … säg vad du vill komma ihåg
            </>
          ) : (
            <>Sparar i inkorgen om {countdown} s · tryck var som helst för att ändra</>
          )}
        </div>
      )}

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
