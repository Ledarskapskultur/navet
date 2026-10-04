"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Database, Lock, LogOut, Mail, RotateCcw, ShieldAlert, Smartphone } from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Card, Notice, PageHeader, Section, inputClass } from "@/components/ui";
import { GoogleTasksIcon } from "@/components/icons";
import { VoiceLaunchSetting } from "@/components/voice-launch-setting";

const ERRORS: Record<string, string> = {
  google_not_configured: "Google OAuth är inte konfigurerat. Lägg till GOOGLE_CLIENT_ID och GOOGLE_CLIENT_SECRET i .env.local.",
  invalid_state: "Inloggningen kunde inte verifieras (state). Försök igen.",
  token_exchange: "Kunde inte hämta token från Google. Kontrollera client secret och redirect-URL.",
  tasks_scope_missing: "Du behöver godkänna åtkomst till Google Tasks för att Navet ska fungera.",
  session_secret: "SESSION_SECRET saknas eller är kortare än 32 tecken. Lägg till den i miljövariablerna.",
  outlook_not_configured: "Outlook är inte konfigurerat. Lägg till MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET och MICROSOFT_TENANT_ID i Vercel.",
  ms_token_exchange: "Kunde inte slutföra kopplingen till Outlook. Kontrollera client secret och redirect-URL i Entra.",
  ms_access_denied: "Du avbröt kopplingen till Outlook, eller så saknas administratörsgodkännande i Entra.",
  ms_consent_required: "Appen behöver administratörsgodkännande i Entra (Grant admin consent).",
  ms_invalid_request: "Microsoft avvisade inloggningen. Kontrollera redirect-URL:en i Entra.",
  access_denied: "Du avbröt inloggningen hos Google.",
};

function SettingsView() {
  const { status, sync, setDefaultList, resetDemo, logout, lock } = useNavet();
  const params = useSearchParams();
  const error = params.get("error");
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div>
      <PageHeader title="Inställningar" subtitle="Röst, säkerhet, lagring och installation." />
      {error && (
        <div className="mb-6 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">{ERRORS[error] ?? `Fel: ${error}`}</div>
      )}

      <Section title="Röst">
        <VoiceLaunchSetting />
      </Section>

      <Section title="Säkerhet">
        {status?.passwordProtected ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-ink-2">
            <p className="flex items-center gap-2">
              <Lock className="size-4 text-accent" /> Navet är skyddat med lösenord. Den här enheten är upplåst.
            </p>
            <Button onClick={() => lock()}>Lås Navet</Button>
          </Card>
        ) : (
          <Notice tone="muted" icon={<ShieldAlert className="size-4" />}>
            <strong className="text-ink">Inget lösenord är satt.</strong> Alla som har länken kan se och ändra din Navet. Lägg till
            miljövariabeln <code>APP_PASSWORD</code> i Vercel (Settings → Environment Variables) och gör en ny deploy.
          </Notice>
        )}
      </Section>

      <Section title="Lagring">
        <Card className="flex items-start gap-3 p-5 text-sm text-ink-2">
          <Database className="mt-0.5 size-5 text-ink-3" />
          <div>
            <p className="font-medium text-ink">
              {status?.storage === "supabase" ? "Supabase-databas" : status?.storageDurable ? "Lokal fil" : "Tillfällig lagring"}
            </p>
            <p className="mt-1">
              {status?.storage === "supabase"
                ? "Allt du sparar ligger kvar i din databas."
                : status?.storageDurable
                  ? "Data sparas i .navet-data/store.json på datorn som kör Navet."
                  : "Varning: på Vercel sparas data bara tillfälligt och kan försvinna. Koppla en Supabase-databas (SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY) innan du börjar använda Navet på riktigt."}
            </p>
          </div>
        </Card>
      </Section>

      <Section title="Installera på mobilen">
        <Card className="flex items-start gap-3 p-5 text-sm text-ink-2">
          <Smartphone className="mt-0.5 size-5 text-ink-3" />
          <p>
            Android (Chrome): öppna Navet → menyn ⋮ → <strong>Installera app</strong> / <strong>Lägg till på startskärmen</strong>.
            iPhone (Safari): Dela → <strong>Lägg till på hemskärmen</strong>.
          </p>
        </Card>
      </Section>

      <Section title="Kopplingar (valfritt)">
        <div className="space-y-3">
          <Card className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <GoogleTasksIcon className="mt-0.5 size-6" />
              <div className="flex-1 text-sm text-ink-2">
                <p className="font-medium text-ink">Google Tasks</p>
                {status?.mode === "google" ? (
                  <p>
                    Inloggad som <strong>{status.user?.name}</strong> ({status.user?.email})
                  </p>
                ) : (
                  <p>Inte kopplat. Navet fungerar fullt ut utan Google – det här behövs bara om du vill synka med Google Tasks.</p>
                )}
              </div>
            </div>
            {status?.mode === "google" ? (
              <Button onClick={() => logout()}>
                <LogOut className="size-4" /> Koppla från Google
              </Button>
            ) : status?.googleConfigured ? (
              <a href="/api/auth/google" className="inline-flex h-9 items-center rounded-xl border border-line px-3 text-sm font-medium text-ink hover:bg-subtle">
                Koppla Google Tasks
              </a>
            ) : null}
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
          <OutlookCard />
        </div>
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

function OutlookCard() {
  const { status, refresh, notify } = useNavet();
  const [busy, setBusy] = useState(false);
  const account = status?.outlook;
  const disconnect = async () => {
    setBusy(true);
    await fetch("/api/auth/microsoft/disconnect", { method: "POST" });
    await refresh();
    setBusy(false);
    notify("Outlook frånkopplat");
  };
  return (
    <Card className="space-y-4 p-5 text-sm text-ink-2">
      <div>
        <p className="flex items-center gap-2 font-medium text-ink">
          <CalendarDays className="size-4" /> Outlook-kalender <Mail className="ml-2 size-4" /> Flaggade mail
        </p>
        {account ? (
          <p className="mt-1">
            Kopplat till <strong className="text-ink">{account.name}</strong> ({account.email}). Navet läser din kalender och dina
            flaggade mail – det ändrar ingenting i Outlook.
          </p>
        ) : status?.outlookConfigured ? (
          <p className="mt-1">Inte kopplat. Kalendern och mailsidan visar exempel tills du kopplar Outlook.</p>
        ) : (
          <p className="mt-1">
            Lägg först in <code>MICROSOFT_CLIENT_ID</code>, <code>MICROSOFT_CLIENT_SECRET</code> och{" "}
            <code>MICROSOFT_TENANT_ID</code> i Vercel (se guiden docs/outlook.md) och gör en ny deploy.
          </p>
        )}
      </div>
      {account ? (
        <Button size="sm" onClick={disconnect} disabled={busy}>
          Koppla från Outlook
        </Button>
      ) : status?.outlookConfigured ? (
        <a
          href="/api/auth/microsoft"
          className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-[15px] font-medium text-white hover:bg-accent-strong"
        >
          Koppla Outlook
        </a>
      ) : null}
    </Card>
  );
}
