"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { AlertTriangle, Download, ExternalLink, Info, Plug, Search } from "lucide-react";
import { Button, Card, EmptyState, Notice, PageHeader, inputClass } from "@/components/ui";
import { useContacts, type ContactsResponse } from "@/hooks/use-remote";
import { api } from "@/lib/client-api";
import { relativeTime } from "@/lib/dates";
import type { IntegrationState } from "@/lib/integrations/types";
import type { LinkedInContact } from "@/lib/types";

const PAGE = 100;
const MAX = 200;

interface SyncResponse {
  ok: boolean;
  message: string;
  skipped?: boolean;
}

const OFF_TEXT: Partial<Record<IntegrationState, { text: string; action: string }>> = {
  not_configured: { text: "LinkedIn är inte konfigurerat än.", action: "Se vad som saknas" },
  locked: { text: "Integrationer är avstängda tills Navet har ett lösenord.", action: "Läs mer" },
};

export default function ContactsPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const { result, error, reload } = useContacts(query, limit);
  const [busy, setBusy] = useState<"manual" | "auto" | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);
  const autoTried = useRef(false);

  // Search as you type, without asking the server for every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(input.trim());
      setLimit(PAGE);
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const sync = async (auto: boolean) => {
    setBusy(auto ? "auto" : "manual");
    if (!auto) setOutcome(null);
    try {
      const res = await api<SyncResponse>("/api/integrations/linkedin/sync", { method: "POST", json: { auto } });
      // The daily fetch in the background only speaks up when something went wrong.
      if (!auto || (!res.ok && !res.skipped)) setOutcome({ ok: res.ok, message: res.message });
      if (!res.skipped) await reload();
    } catch (e) {
      if (!auto) setOutcome({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  // More than a day since the last fetch: ask the server once. The server decides whether it is due.
  const due = result?.autoSyncDue ?? false;
  useEffect(() => {
    if (!due || autoTried.current) return;
    autoTried.current = true;
    void sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);

  const off = result ? OFF_TEXT[result.state] : undefined;
  const usable = result && !off;

  return (
    <div>
      <PageHeader
        title="Kontakter"
        subtitle="Dina LinkedIn-kontakter, hämtade via LinkedIns officiella API. Navet läser bara och ändrar ingenting på LinkedIn."
        actions={
          usable ? (
            <Button onClick={() => sync(false)} disabled={busy !== null}>
              <Download className={busy ? "size-4 animate-pulse" : "size-4"} />
              {busy ? "Hämtar …" : result.lastSyncAt ? "Hämta om" : "Hämta kontakter"}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 space-y-3">
        {off && (
          <Notice tone="muted" icon={<Plug className="size-4" />}>
            <strong className="font-semibold text-ink">{off.text}</strong> Inget visas här förrän LinkedIn är anslutet, så att du alltid ser dina
            riktiga kontakter och aldrig exempel.{" "}
            <Link href="/integrationer" className="font-medium text-accent underline underline-offset-2">
              {off.action}
            </Link>
          </Notice>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Kunde inte läsa kontakterna: {error}
          </p>
        )}
        {usable && result.error && !outcome && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {result.error}{" "}
              <Link href="/integrationer" className="underline underline-offset-2">
                Öppna Integrationer
              </Link>
            </span>
          </p>
        )}
        {outcome && (
          <p
            role="status"
            className={
              outcome.ok
                ? "flex items-start gap-2 rounded-2xl border border-accent/15 bg-accent-soft/60 px-4 py-3 text-sm text-accent-strong"
                : "flex items-start gap-2 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn"
            }
          >
            {outcome.ok ? <Info className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            {outcome.message}
          </p>
        )}
        {usable && result.pending && !outcome && (
          <Notice tone="muted" icon={<Info className="size-4" />}>
            <strong className="font-semibold text-ink">Inte klart än.</strong> LinkedIn godkänner åtkomsttoken, men kontaktlistan är inte färdig.
            LinkedIn sammanställer den när token skapas och det kan dröja. Försök igen senare.
          </Notice>
        )}
      </div>

      {result === null && !error && <div className="h-64 animate-pulse rounded-2xl bg-sunken/60" />}

      {usable && result.total > 0 && <ContactList result={result} input={input} onInput={setInput} busy={busy} limit={limit} onMore={() => setLimit(MAX)} />}

      {usable && result.total === 0 && !result.pending && (
        <EmptyState
          title="Inga kontakter hämtade än"
          text="Tryck Hämta kontakter för att läsa in din kontaktlista från LinkedIn. Första gången kan det ta en liten stund."
          action={
            <Button variant="primary" onClick={() => sync(false)} disabled={busy !== null}>
              <Download className="size-4" /> {busy ? "Hämtar …" : "Hämta kontakter"}
            </Button>
          }
        />
      )}
    </div>
  );
}

function ContactList({
  result,
  input,
  onInput,
  busy,
  limit,
  onMore,
}: {
  result: ContactsResponse;
  input: string;
  onInput: (v: string) => void;
  busy: "manual" | "auto" | null;
  limit: number;
  onMore: () => void;
}) {
  const shown = result.contacts.length;
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Sök på namn eller företag</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder="Sök på namn eller företag"
            className={`${inputClass} pl-9`}
          />
        </label>
        <p className="text-sm text-ink-3" aria-live="polite">
          {result.matching === result.total
            ? `${result.total.toLocaleString("sv-SE")} kontakter`
            : `${result.matching.toLocaleString("sv-SE")} av ${result.total.toLocaleString("sv-SE")} kontakter`}
          {result.lastSyncAt && ` · hämtade ${relativeTime(result.lastSyncAt)}`}
          {busy === "auto" && " · hämtar uppdateringar …"}
        </p>
      </div>

      {shown === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-ink-2">Ingen kontakt matchar sökningen.</p>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {result.contacts.map((c) => (
            <ContactRow key={c.id} contact={c} />
          ))}
        </Card>
      )}

      {shown < result.matching && (
        <div className="mt-4 text-center text-sm text-ink-3">
          {limit < MAX ? (
            <Button variant="ghost" onClick={onMore}>
              Visa fler
            </Button>
          ) : (
            <p>
              Visar de första {shown} av {result.matching.toLocaleString("sv-SE")}. Sök för att hitta en viss person.
            </p>
          )}
        </div>
      )}

      <p className="mt-6 text-sm leading-relaxed text-ink-3">
        Listan hämtas högst en gång per dygn och när du trycker Hämta om. LinkedIn anger inte hur ofta deras ögonblicksbild uppdateras, så nya
        kontakter kan dröja innan de syns här.
      </p>
    </>
  );
}

/** "11 okt 2026" for a date Navet could read, otherwise LinkedIn's own text. */
function connectedLabel(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? format(parseISO(value), "d MMM yyyy", { locale: sv }) : value;
}

function ContactRow({ contact: c }: { contact: LinkedInContact }) {
  const work = [c.title, c.company].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-ink">{c.name}</p>
        {work && <p className="truncate text-sm text-ink-2">{work}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-4 text-sm text-ink-3">
        {c.connectedOn && <span title="Kontakt sedan">Kontakt sedan {connectedLabel(c.connectedOn)}</span>}
        {c.profileUrl && (
          <a href={c.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent underline underline-offset-2">
            LinkedIn <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
