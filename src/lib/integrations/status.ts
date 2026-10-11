import "server-only";
import { env, integrationsUnlocked, linkedinConfigured, msSecretProblem, sessionSecretOk } from "../server/env";
import type { NavetStore } from "../server/store";
import { msRedirectUri } from "./microsoft/oauth";
import { msFeatureStatus } from "./microsoft/providers";
import { MS_DEFAULT_GRANT, MS_SCOPE_GROUPS, hasMsGroup, hasMsScope, type MsFeature, type MsScopeGroupId } from "./microsoft/scopes";
import type { CapabilityStatus, IntegrationCapability, IntegrationId, IntegrationPermission, IntegrationStatus } from "./types";

export const linkedinRedirectUri = (appBase: string) => `${appBase}/api/auth/linkedin/callback`;

function msMissingConfig(): string[] {
  const missing: string[] = [];
  if (!env.msClientId) missing.push("MICROSOFT_CLIENT_ID");
  if (!env.msClientSecret) missing.push("MICROSOFT_CLIENT_SECRET");
  if (!process.env.MICROSOFT_TENANT_ID) missing.push("MICROSOFT_TENANT_ID");
  if (!sessionSecretOk()) missing.push("SESSION_SECRET");
  return missing;
}

/** Says what is wrong when MICROSOFT_CLIENT_SECRET has the wrong shape. Never includes the value. */
export function msConfigWarning(): string | null {
  switch (msSecretProblem()) {
    case "secret_id":
      return "MICROSOFT_CLIENT_SECRET innehåller hemlighetens Secret ID, inte dess Value. I Entra visas båda bredvid varandra: kopiera kolumnen Value (den som inte ser ut som xxxxxxxx-xxxx-…), lägg in den i Vercel och gör en ny deploy.";
    case "quoted":
      return "MICROSOFT_CLIENT_SECRET är omgiven av citattecken. Ta bort citattecknen i Vercel och gör en ny deploy.";
    case "too_short":
      return "MICROSOFT_CLIENT_SECRET är kortare än en klienthemlighet brukar vara. Värdet kan ha blivit avklippt: kopiera hela Value från Entra igen och gör en ny deploy.";
    default:
      return null;
  }
}

function msPermissions(feature: MsFeature, granted: string[], connected: boolean): IntegrationPermission[] {
  const base: IntegrationPermission = {
    scope: "User.Read",
    label: "Logga in och läsa din profil",
    purpose: "Visa vilket konto som är anslutet.",
    granted: connected && hasMsScope(granted, "User.Read"),
    level: "base",
  };
  const groups = (Object.keys(MS_SCOPE_GROUPS) as MsScopeGroupId[]).filter((id) => MS_SCOPE_GROUPS[id].feature === feature);
  return [
    base,
    ...groups.map((id): IntegrationPermission => {
      const g = MS_SCOPE_GROUPS[id];
      return {
        scope: g.scopes.join(" "),
        label: g.label,
        purpose: g.available ? g.purpose : `${g.purpose} Begärs först i fas ${g.phase}, när funktionen finns.`,
        granted: connected && hasMsGroup(granted, id),
        level: g.level,
        grant: g.available ? id : undefined,
      };
    }),
  ];
}

interface CapabilitySpec {
  id: string;
  label: string;
  effect: "read" | "write";
  /** The scope group the capability needs */
  group: MsScopeGroupId;
  /** Built and working in this version */
  built: boolean;
  note?: string;
}

const MAIL_CAPABILITIES: CapabilitySpec[] = [
  { id: "mail.summary", label: "Olästa, flaggade, viktiga och senaste mejl på startsidan", effect: "read", group: "mail_read", built: true },
  { id: "mail.to_task", label: "Skapa uppgifter i Navet från mejl", effect: "read", group: "mail_read", built: true, note: "Uppgiften skapas i Navet. Inget ändras i Outlook." },
  { id: "mail.inbox", label: "Hela inkorgen: läsa mejl, söka, filtrera och se mejltrådar", effect: "read", group: "mail_read", built: false, note: "Byggs i fas 2." },
  { id: "mail.flag", label: "Flagga och avflagga mejl", effect: "write", group: "mail_write", built: false, note: "Byggs i fas 2." },
  { id: "mail.draft", label: "Skriva och spara utkast", effect: "write", group: "mail_write", built: false, note: "Byggs i fas 2." },
  { id: "mail.send", label: "Skicka mejl efter ditt godkännande", effect: "write", group: "mail_send", built: false, note: "Byggs i fas 2." },
];

const CALENDAR_CAPABILITIES: CapabilitySpec[] = [
  { id: "calendar.agenda", label: "Dagens agenda, kommande möten och veckovy", effect: "read", group: "calendar_read", built: true },
  { id: "calendar.details", label: "Mötesinformation: plats, deltagare och länk till onlinemöte", effect: "read", group: "calendar_read", built: true },
  { id: "calendar.availability", label: "Lediga och upptagna tider samt månadsvy", effect: "read", group: "calendar_read", built: false, note: "Byggs i fas 3." },
  { id: "calendar.create", label: "Skapa bokningar och Teams-möten, bjuda in deltagare", effect: "write", group: "calendar_write", built: false, note: "Byggs i fas 3. Tills dess öppnar Boka möte Outlook." },
  { id: "calendar.change", label: "Flytta eller avboka möten efter bekräftelse", effect: "write", group: "calendar_write", built: false, note: "Byggs i fas 3." },
];

function msCapabilities(specs: CapabilitySpec[], granted: string[], connected: boolean): IntegrationCapability[] {
  return specs.map(({ group, built, ...c }) => {
    let status: CapabilityStatus = "planned";
    if (built) status = connected && hasMsGroup(granted, group) ? "active" : "needs_permission";
    return { ...c, status, note: built && status === "needs_permission" && !connected ? "Anslut kontot för att aktivera." : c.note };
  });
}

async function microsoftStatus(store: NavetStore, feature: MsFeature, baseUrl: string): Promise<IntegrationStatus> {
  const { state, connection, health } = await msFeatureStatus(store, feature);
  const on = Boolean(connection?.features[feature]);
  const granted = connection?.scopes ?? [];
  const id: IntegrationId = feature === "mail" ? "outlook_mail" : "outlook_calendar";
  const canConnect = state === "disconnected" || state === "needs_reauth" || state === "error";
  return {
    id,
    name: feature === "mail" ? "Microsoft Outlook" : "Microsoft Kalender",
    provider: "microsoft",
    description:
      feature === "mail"
        ? "Mejl från ditt Microsoft 365-konto via Microsoft Graph."
        : "Outlook-kalendern från ditt Microsoft 365-konto via Microsoft Graph.",
    state,
    available: true,
    account: on && connection ? { name: connection.account.name, email: connection.account.email } : null,
    connectedAt: on ? (connection?.connectedAt ?? null) : null,
    lastSyncAt: on ? health[feature].lastSyncAt : null,
    lastError: !on
      ? null
      : state === "needs_reauth"
        ? "Microsoft godkänner inte längre den sparade inloggningen. Anslut kontot igen."
        : health[feature].lastError,
    permissions: msPermissions(feature, granted, on),
    capabilities: msCapabilities(feature === "mail" ? MAIL_CAPABILITIES : CALENDAR_CAPABILITIES, granted, on && state !== "needs_reauth"),
    connectUrl: canConnect ? `/api/auth/microsoft?grant=${MS_DEFAULT_GRANT[feature]}&return=/integrationer` : null,
    missingConfig: state === "not_configured" ? msMissingConfig() : [],
    configWarning: msConfigWarning(),
    redirectUri: msRedirectUri(baseUrl),
  };
}

/**
 * LinkedIn's official API is narrow. What is listed as unavailable here is not offered to
 * self-registered apps; Navet never scrapes or uses unofficial endpoints.
 */
function linkedinStatus(baseUrl: string): IntegrationStatus {
  const missing: string[] = [];
  if (!env.linkedinClientId) missing.push("LINKEDIN_CLIENT_ID");
  if (!env.linkedinClientSecret) missing.push("LINKEDIN_CLIENT_SECRET");
  return {
    id: "linkedin",
    name: "LinkedIn",
    provider: "linkedin",
    description: "Ditt LinkedIn-konto via LinkedIns officiella OAuth och dokumenterade API:er.",
    state: !linkedinConfigured() ? "not_configured" : integrationsUnlocked() ? "disconnected" : "locked",
    available: false,
    availabilityNote: "Anslutningen byggs i fas 4, efter Outlook och kalendern.",
    account: null,
    connectedAt: null,
    lastSyncAt: null,
    lastError: null,
    permissions: [
      { scope: "openid profile email", label: "Logga in och läsa din profil", purpose: "Visa namn, bild och e-post för det anslutna kontot (Sign In with LinkedIn using OpenID Connect).", granted: false, level: "base" },
      { scope: "w_member_social", label: "Publicera inlägg", purpose: "Publicera ett inlägg i ditt namn när du har godkänt det (Share on LinkedIn).", granted: false, level: "optional" },
    ],
    capabilities: [
      { id: "linkedin.profile", label: "Ansluta kontot och visa grundläggande profil", effect: "read", status: "planned", note: "Byggs i fas 4." },
      { id: "linkedin.drafts", label: "Förbereda, spara och planera inlägg i Navet", effect: "read", status: "planned", note: "Byggs i fas 4. Utkasten sparas i Navet." },
      { id: "linkedin.publish", label: "Publicera inlägg efter ditt godkännande", effect: "write", status: "planned", note: "Byggs i fas 4 med behörigheten w_member_social." },
      { id: "linkedin.stats", label: "Statistik för inlägg", effect: "read", status: "unavailable", note: "Kräver att LinkedIn godkänner appen som partner (Community Management API). Inte öppet för egna appar. Navet länkar till statistiken på LinkedIn." },
      { id: "linkedin.social", label: "Meddelanden, kontakter och aktivitetsflöde", effect: "read", status: "unavailable", note: "Finns inte i LinkedIns öppna API. Navet länkar till LinkedIn i stället." },
    ],
    connectUrl: null,
    missingConfig: missing,
    configWarning: null,
    redirectUri: linkedinRedirectUri(baseUrl),
  };
}

export async function integrationStatuses(store: NavetStore, baseUrl: string): Promise<IntegrationStatus[]> {
  const [mail, calendar] = await Promise.all([microsoftStatus(store, "mail", baseUrl), microsoftStatus(store, "calendar", baseUrl)]);
  return [mail, calendar, linkedinStatus(baseUrl)];
}

export async function integrationStatus(store: NavetStore, baseUrl: string, id: IntegrationId): Promise<IntegrationStatus> {
  return (await integrationStatuses(store, baseUrl)).find((s) => s.id === id)!;
}
