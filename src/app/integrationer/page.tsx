"use client";

import clsx from "clsx";
import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  CalendarDays,
  Check,
  CircleDashed,
  Clock3,
  Download,
  ExternalLink,
  Info,
  KeyRound,
  Lock,
  Mail,
  Plug,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Users,
} from "lucide-react";
import { useNavet } from "@/components/navet-provider";
import { Button, Card, Notice, PageHeader, Pill } from "@/components/ui";
import { LinkedInIcon } from "@/components/icons";
import { useIntegrations } from "@/hooks/use-remote";
import { api } from "@/lib/client-api";
import { relativeTime } from "@/lib/dates";
import { STATE_LABEL, type CapabilityStatus, type IntegrationId, type IntegrationState, type IntegrationStatus } from "@/lib/integrations/types";

const ERRORS: Record<string, string> = {
  outlook_not_configured: "Microsoft-anslutningen är inte konfigurerad på servern. Se kortet nedan för vad som saknas.",
  session_secret: "SESSION_SECRET saknas eller är kortare än 32 tecken. Den krävs för att kryptera anslutningen.",
  app_password_required: "Integrationer är avstängda tills Navet skyddas med lösenord. Lägg till APP_PASSWORD och gör en ny deploy.",
  cross_site: "Anslutningen måste startas härifrån. Tryck på Anslut konto på kortet nedan.",
  invalid_state: "Inloggningen kunde inte verifieras. Det händer om det gått mer än 10 minuter eller om du bytt webbläsare. Försök igen.",
  ms_token_exchange: "Microsoft godkände inte inloggningen. Kontrollera klienthemligheten och redirect-URI:n i Entra.",
  ms_no_refresh_token: "Microsoft gav ingen varaktig inloggning (offline_access saknas). Kontrollera behörigheterna i Entra.",
  ms_scope_missing: "Behörigheten beviljades inte, så ingenting anslöts. Godkänn behörigheten eller be en administratör ge samtycke i Entra.",
  ms_access_denied: "Du avbröt anslutningen, eller så saknas administratörssamtycke i Entra.",
  ms_consent_required: "Appen behöver administratörssamtycke i Entra (Grant admin consent).",
  ms_invalid_request: "Microsoft avvisade begäran. Kontrollera att redirect-URI:n i Entra stämmer exakt.",
  ms_invalid_client:
    "Microsoft avvisade klienthemligheten. Värdet i MICROSOFT_CLIENT_SECRET hör inte till den här appen, har gått ut eller är ofullständigt. Skapa en ny hemlighet under samma app i Entra, kopiera kolumnen Value, lägg in den i Vercel för Production och gör en ny deploy.",
  ms_secret_is_id:
    "Microsoft avvisade klienthemligheten. Värdet i MICROSOFT_CLIENT_SECRET är hemlighetens Secret ID, inte dess Value. Kopiera kolumnen Value i Entra, lägg in den i Vercel och gör en ny deploy.",
  ms_invalid_grant: "Microsoft godkände inte svaret från inloggningen. Försök igen. Om det upprepas stämmer inte redirect-URI:n i Entra med Navets adress.",
  ms_unauthorized_client: "Appen i Entra får inte använda den här inloggningsmetoden. Kontrollera att plattformen är Web.",
};

const STATE_STYLE: Record<IntegrationState, string> = {
  connected: "bg-accent-soft text-accent-strong",
  disconnected: "bg-subtle text-ink-2",
  not_configured: "bg-amber-soft text-amber",
  locked: "bg-amber-soft text-amber",
  needs_reauth: "bg-warn-soft text-warn",
  error: "bg-warn-soft text-warn",
};

const ICON: Record<IntegrationId, (p: { className?: string }) => ReactNode> = {
  outlook_mail: Mail,
  outlook_calendar: CalendarDays,
  linkedin: LinkedInIcon,
};

const CAPABILITY: Record<CapabilityStatus, { label: string; className: string; icon: typeof Check }> = {
  active: { label: "Fungerar", className: "text-accent", icon: Check },
  needs_permission: { label: "Kräver anslutning", className: "text-ink-3", icon: CircleDashed },
  planned: { label: "Kommer", className: "text-ink-3", icon: Clock3 },
  unavailable: { label: "Finns inte i API:et", className: "text-ink-3", icon: Ban },
};

function IntegrationsView() {
  const { refresh } = useNavet();
  const { integrations, error, set } = useIntegrations();
  const params = useSearchParams();
  // What Microsoft's redirect told us. Kept in state, because the address bar is tidied right
  // after (which also clears the search params) and the message should stay on screen.
  const [outcome] = useState(() => ({ error: params.get("error"), connected: params.get("connected"), switched: params.get("switched") === "1" }));
  const { error: errorCode, connected, switched } = outcome;

  useEffect(() => {
    if (!connected && !errorCode) return;
    if (connected) void refresh();
    window.history.replaceState(null, "", window.location.pathname);
  }, [connected, errorCode, refresh]);

  const connectedNames = (connected ?? "")
    .split(",")
    .map((id) => integrations?.find((i) => i.id === id)?.name)
    .filter(Boolean);

  return (
    <div>
      <PageHeader
        title="Integrationer"
        subtitle="Anslut dina konton. Navet använder tjänsternas officiella inloggning och API:er, ser aldrig ditt lösenord och ber bara om de behörigheter som används."
      />

      {errorCode && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{ERRORS[errorCode] ?? `Anslutningen misslyckades (${errorCode}).`}</p>
        </div>
      )}
      {connected && connectedNames.length > 0 && (
        <div role="status" className="mb-6">
          <Notice icon={<Check className="size-4" />}>
            <strong className="font-semibold">{connectedNames.join(" och ")} är anslutet.</strong>{" "}
            {switched && "Du loggade in med ett annat konto än tidigare, så den förra anslutningen har ersatts. Anslut den andra delen igen om du vill ha kvar den. "}
            Tryck på Testa anslutningen för att se att allt fungerar.
          </Notice>
        </div>
      )}
      {error && (
        <div role="alert" className="mb-6 rounded-2xl border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
          Kunde inte läsa integrationernas status: {error}
        </div>
      )}

      <div className="space-y-5">
        {integrations === null && !error && [0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-sunken/60" />)}
        {integrations?.map((i) => (
          <IntegrationCard
            key={i.id}
            integration={i}
            onChange={(list) => {
              set(list);
              void refresh();
            }}
          />
        ))}
      </div>

      <p className="mt-8 flex items-start gap-2 text-sm leading-relaxed text-ink-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Åtkomstnycklar sparas krypterade (AES-256-GCM) på servern och skickas aldrig till webbläsaren. LinkedIns åtkomsttoken ligger som
        miljövariabel på servern och används bara där. Allt som skickar, publicerar, ändrar eller raderar något hos en tjänst kräver ditt
        godkännande. Google Tasks hanteras under Inställningar.
      </p>
    </div>
  );
}

function IntegrationCard({
  integration: i,
  onChange,
}: {
  integration: IntegrationStatus;
  onChange: (list: IntegrationStatus[]) => void;
}) {
  const { notify } = useNavet();
  const [busy, setBusy] = useState<"test" | "sync" | "disconnect" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const Icon = ICON[i.id];
  const isOn = i.state === "connected" || i.state === "error" || i.state === "needs_reauth";

  const test = async () => {
    setBusy("test");
    setTestResult(null);
    try {
      const res = await api<{ ok: boolean; message: string; integrations: IntegrationStatus[] }>(`/api/integrations/${i.id}/test`, { method: "POST" });
      setTestResult({ ok: res.ok, message: res.message });
      onChange(res.integrations);
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  // Fetches the integration's data again (LinkedIn contacts). Only reads from the provider.
  const sync = async () => {
    setBusy("sync");
    setTestResult(null);
    try {
      const res = await api<{ ok: boolean; message: string; integrations: IntegrationStatus[] }>(`/api/integrations/${i.id}/sync`, { method: "POST", json: {} });
      setTestResult({ ok: res.ok, message: res.message });
      onChange(res.integrations);
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      const res = await api<{ integrations: IntegrationStatus[] }>(`/api/integrations/${i.id}/disconnect`, { method: "POST" });
      setTestResult(null);
      onChange(res.integrations);
      notify(`${i.name} är frånkopplat`);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(null);
      setConfirm(false);
    }
  };

  return (
    <Card as="section" className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink-2">
          <Icon className="size-5" />
        </span>
        {/* The basis keeps the text readable: a long row of buttons moves to its own line instead of squeezing it. */}
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{i.name}</h2>
            <Pill className={STATE_STYLE[i.state]}>{STATE_LABEL[i.state]}</Pill>
          </div>
          <p className="mt-1 text-sm text-ink-2">{i.description}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {i.connectUrl && (
            <a
              href={i.connectUrl}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[15px] font-medium text-on-accent transition-colors hover:bg-accent-strong"
            >
              <Plug className="size-4" /> {i.state === "disconnected" ? "Anslut konto" : "Anslut igen"}
            </a>
          )}
          {isOn && (
            <Button onClick={test} disabled={busy !== null}>
              <RefreshCw className={clsx("size-4", busy === "test" && "animate-spin")} />
              {i.state === "connected" ? "Testa anslutningen" : "Försök igen"}
            </Button>
          )}
          {isOn && i.canSync && (
            <Button onClick={sync} disabled={busy !== null}>
              <Download className={clsx("size-4", busy === "sync" && "animate-pulse")} />
              {busy === "sync" ? "Hämtar …" : i.lastSyncAt ? "Hämta om" : "Hämta kontakter"}
            </Button>
          )}
          {i.id === "linkedin" && isOn && (
            <Link
              href="/kontakter"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-[15px] font-medium text-ink hover:bg-subtle"
            >
              <Users className="size-4" /> Visa kontakter
            </Link>
          )}
          {i.id === "linkedin" && isOn && (
            <Link
              href="/linkedin"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-[15px] font-medium text-ink hover:bg-subtle"
            >
              <BarChart3 className="size-4" /> Inläggsstatistik
            </Link>
          )}
          {isOn &&
            i.canDisconnect &&
            (confirm ? (
              <Button variant="danger" onClick={disconnect} disabled={busy !== null}>
                Bekräfta
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirm(true)} disabled={busy !== null}>
                <Unplug className="size-4" /> Koppla från
              </Button>
            ))}
          {i.id === "linkedin" && (
            <a
              href="https://www.linkedin.com/feed/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-[15px] font-medium text-ink hover:bg-subtle"
            >
              Öppna LinkedIn <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </div>

      {(i.lastError || testResult) && (
        <div className="space-y-2 px-5 pb-1 sm:px-6">
          {i.lastError && !testResult?.ok && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {i.lastError}
            </p>
          )}
          {testResult && testResult.message !== i.lastError && (
            <p
              role="status"
              className={clsx(
                "flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm",
                testResult.ok ? "bg-accent-soft text-accent-strong" : "bg-warn-soft text-warn",
              )}
            >
              {testResult.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              {testResult.message}
            </p>
          )}
        </div>
      )}

      {!i.available && i.availabilityNote && (
        <p className="mx-5 mb-1 flex items-start gap-2 rounded-xl bg-subtle px-3 py-2.5 text-sm text-ink-2 sm:mx-6">
          <Clock3 className="mt-0.5 size-4 shrink-0" /> {i.availabilityNote}
        </p>
      )}
      {i.notice && !testResult && (
        <p role="status" className="mx-5 mb-1 flex items-start gap-2 rounded-xl bg-subtle px-3 py-2.5 text-sm text-ink-2 sm:mx-6">
          <Info className="mt-0.5 size-4 shrink-0" /> <span>{i.notice}</span>
        </p>
      )}
      {i.configWarning && (
        <p role="alert" className="mx-5 mb-1 flex items-start gap-2 rounded-xl bg-amber-soft px-3 py-2.5 text-sm text-amber sm:mx-6">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{i.configWarning}</span>
        </p>
      )}
      {i.state === "locked" && (
        <p className="mx-5 mb-1 flex items-start gap-2 rounded-xl bg-amber-soft px-3 py-2.5 text-sm text-amber sm:mx-6">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            Navet ligger öppet på internet utan lösenord. Lägg till miljövariabeln <code>APP_PASSWORD</code> och gör en ny deploy, så slås
            integrationerna på.
          </span>
        </p>
      )}
      {i.state === "not_configured" && <SetupBox integration={i} />}

      <dl className="grid gap-x-8 gap-y-3 border-t border-line px-5 py-4 text-sm sm:grid-cols-3 sm:px-6">
        {i.storedCount === null && !i.canSync ? (
          <Fact label="Konto" value={i.account ? `${i.account.name} · ${i.account.email}` : "–"} />
        ) : (
          <Fact label="Hämtade kontakter" value={i.storedCount === null ? "–" : i.storedCount.toLocaleString("sv-SE")} />
        )}
        <Fact label={i.canSync ? "Senast hämtad" : "Senaste synkronisering"} value={i.lastSyncAt ? relativeTime(i.lastSyncAt) : isOn ? "Inte än" : "–"} />
        <Fact
          label={i.canDisconnect ? "Ansluten sedan" : "Token i bruk sedan"}
          value={i.connectedAt ? new Date(i.connectedAt).toLocaleDateString("sv-SE") : "–"}
        />
      </dl>

      <div className="grid gap-6 border-t border-line bg-canvas/50 px-5 py-5 sm:px-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
            <KeyRound className="size-3.5" /> Behörigheter
          </h3>
          <ul className="space-y-2.5">
            {i.permissions.map((p) => (
              <li key={p.scope} className="flex items-start gap-2.5 text-sm">
                {p.granted ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-label="Beviljad" />
                ) : (
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-ink-3" aria-label="Inte beviljad" />
                )}
                <div className="min-w-0">
                  <p className="text-ink">
                    {p.label} <code className="ml-1 break-all rounded bg-subtle px-1.5 py-0.5 text-xs text-ink-2">{p.scope}</code>
                  </p>
                  <p className="text-ink-3">{p.purpose}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Funktioner</h3>
          <ul className="space-y-2.5">
            {i.capabilities.map((c) => {
              const s = CAPABILITY[c.status];
              return (
                <li key={c.id} className="flex items-start gap-2.5 text-sm">
                  <s.icon className={clsx("mt-0.5 size-4 shrink-0", s.className)} aria-hidden />
                  <div className="min-w-0">
                    <p className={c.status === "active" ? "text-ink" : "text-ink-2"}>
                      {c.label}
                      <span className="ml-2 whitespace-nowrap text-xs text-ink-3">{s.label}</span>
                      {c.effect === "write" && <span className="ml-2 whitespace-nowrap text-xs text-ink-3">· kräver godkännande</span>}
                    </p>
                    {c.note && <p className="text-ink-3">{c.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

const Env = ({ names }: { names: string[] }) => (
  <>
    {names.map((v, n) => (
      <span key={v}>
        {n > 0 && ", "}
        <code className="rounded bg-surface px-1.5 py-0.5 text-xs">{v}</code>
      </span>
    ))}
  </>
);

/** What has to be done outside Navet before the account can be connected. */
function SetupBox({ integration: i }: { integration: IntegrationStatus }) {
  const microsoft = i.provider === "microsoft";
  return (
    <div className="mx-5 mb-4 rounded-xl border border-amber/20 bg-amber-soft/60 px-4 py-3 text-sm text-ink-2 sm:mx-6">
      <p className="font-medium text-ink">
        {microsoft ? "Ej konfigurerad. Det här behövs innan du kan ansluta:" : "Ej konfigurerad. Det här behövs innan kontakterna kan hämtas:"}
      </p>
      {microsoft ? (
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Registrera en app i Microsoft Entra ID (entra.microsoft.com → App registrations).</li>
          <li>
            Lägg in redirect-URI:n <code className="break-all rounded bg-surface px-1.5 py-0.5 text-xs">{i.redirectUri}</code> (plattform: Web).
          </li>
          <li>
            Lägg till miljövariablerna <Env names={i.missingConfig} /> på servern (Vercel → Settings → Environment Variables) och gör en ny deploy.
          </li>
        </ol>
      ) : (
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            Skapa en app på LinkedIn Developers (linkedin.com/developers/apps) med standardsidan Member Data Portability (Member) Default Company som
            företagssida, och lägg till produkten Member Data Portability API (Member) under Products.
          </li>
          <li>
            Skapa en åtkomsttoken i LinkedIns tokenverktyg (linkedin.com/developers/tools/oauth/token-generator) med behörigheten{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 text-xs">r_dma_portability_self_serve</code>. Den gäller i upp till ett år.
          </li>
          <li>
            Lägg in token i miljövariabeln <Env names={i.missingConfig} /> på servern (Vercel → Settings → Environment Variables, Production) och gör
            en ny deploy. Klistra aldrig in token någon annanstans.
          </li>
        </ol>
      )}
      <p className="mt-2 text-ink-3">Hela guiden steg för steg finns i docs/integrationer.md i projektet.</p>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsView />
    </Suspense>
  );
}
