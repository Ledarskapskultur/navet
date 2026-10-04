"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Database, LogOut, Mail, RotateCcw, Smartphone } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Card, Notice, PageHeader, Section, inputClass } from "@/components/ui";
import { GoogleTasksIcon } from "@/components/icons";

const ERRORS: Record<string, string> = {
  google_not_configured: "Google OAuth är inte konfigurerat. Lägg till GOOGLE_CLIENT_ID och GOOGLE_CLIENT_SECRET i .env.local.",
  invalid_state: "Inloggningen kunde inte verifieras (state). Försök igen.",
  token_exchange: "Kunde inte hämta token från Google. Kontrollera client secret och redirect-URL.",
  tasks_scope_missing: "Du behöver godkänna åtkomst till Google Tasks för att Navet ska fungera.",
  session_secret: "SESSION_SECRET saknas eller är kortare än 32 tecken. Lägg till den i miljövariablerna.",
  access_denied: "Du avbröt inloggningen hos Google.",
};

function SettingsView() {
  const { status, sync, setDefaultList, resetDemo, logout } = useNavet();
  const params = useSearchParams();
  const error = params.get("error");
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div>
      <PageHeader title="Inställningar" subtitle="Kopplingar, lagring och installation." />
      {error && (
        <div className="mb-6 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">{ERRORS[error] ?? `Fel: ${error}`}</div>
      )}

      <Section title="Google">
        <Card className="space-y-5 p-5">
          <div className="flex items-start gap-3">
            <GoogleTasksIcon className="mt-0.5 size-6" />
            <div className="flex-1">
              <p className="font-medium">Google-konto & Google Tasks</p>
              {status?.mode === "google" ? (
                <p className="text-sm text-ink-2">
                  Inloggad som <strong>{status.user?.name}</strong> ({status.user?.email})
                </p>
              ) : status?.googleConfigured ? (
                <p className="text-sm text-ink-2">Inte inloggad – du använder demoläget.</p>
              ) : (
                <p className="text-sm text-ink-2">Google OAuth är inte konfigurerat ännu – appen körs i demoläge.</p>
              )}
            </div>
          </div>

          {status?.mode === "google" ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => logout()}>
                <LogOut className="size-4" /> Logga ut
              </Button>
            </div>
          ) : status?.googleConfigured ? (
            <a href="/api/auth/google" className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[15px] font-medium text-white hover:bg-accent-strong">
              Logga in med Google
            </a>
          ) : (
            <Notice tone="muted">
              Lägg till följande i <code>.env.local</code> och starta om servern (se README för steg-för-steg):
              <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-3 text-xs text-ink">{`GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=<minst 32 slumpmässiga tecken>
APP_URL=http://localhost:3000`}</pre>
            </Notice>
          )}

          {(sync?.lists.length ?? 0) > 0 && (
            <label className="block max-w-sm">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-3">Standardlista för nya uppgifter</span>
              <select className={inputClass} value={sync?.defaultListId ?? ""} onChange={(e) => setDefaultList(e.target.value)}>
                {sync?.lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </label>
          )}
        </Card>
      </Section>

      <Section title="Microsoft 365">
        <Card className="space-y-3 p-5 text-sm text-ink-2">
          <p className="flex items-center gap-2 font-medium text-ink">
            <CalendarDays className="size-4" /> Outlook-kalender <Mail className="ml-2 size-4" /> Flaggade mail
          </p>
          <p>
            Kommer i nästa steg via Microsoft Graph. Koden är förberedd i <code>src/lib/integrations/microsoft</code>.{" "}
            {status?.outlookConfigured ? "Credentials hittades i miljön." : "Inga Microsoft-credentials konfigurerade."}
          </p>
        </Card>
      </Section>

      <Section title="Lagring">
        <Card className="flex items-start gap-3 p-5 text-sm text-ink-2">
          <Database className="mt-0.5 size-5 text-ink-3" />
          <div>
            <p className="font-medium text-ink">{status?.storage === "supabase" ? "Supabase (Postgres)" : "Lokal fil (.navet-data/store.json)"}</p>
            <p className="mt-1">
              {status?.storage === "supabase"
                ? "Data lagras i din Supabase-databas."
                : "Bra för lokal utveckling. Sätt SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY för produktion."}
            </p>
          </div>
        </Card>
      </Section>

      <Section title="Installera på mobilen">
        <Card className="flex items-start gap-3 p-5 text-sm text-ink-2">
          <Smartphone className="mt-0.5 size-5 text-ink-3" />
          <p>
            Android (Chrome): öppna Navet → menyn ⋮ → <strong>Installera app</strong> / <strong>Lägg till på startskärmen</strong>.
            iPhone (Safari): Dela → <strong>Lägg till på hemskärmen</strong>. Kräver https (t.ex. efter deploy till Vercel).
          </p>
        </Card>
      </Section>

      {status?.mode === "demo" && (
        <Section title="Demodata">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-ink-2">
            <p>Återställ exempeldata och den simulerade Google Tasks.</p>
            {confirmReset ? (
              <Button variant="danger" onClick={() => resetDemo().then(() => setConfirmReset(false))}>
                Bekräfta återställning
              </Button>
            ) : (
              <Button onClick={() => setConfirmReset(true)}>
                <RotateCcw className="size-4" /> Återställ demo
              </Button>
            )}
          </Card>
        </Section>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
