import "server-only";

// All secrets are read server-side only. Nothing here is exposed to the browser.
export const env = {
  appUrl: process.env.APP_URL?.replace(/\/$/, "") || null,
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
  sessionSecret: process.env.SESSION_SECRET || null,
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  // Trimmed: a pasted value easily brings a trailing space or line break along.
  msClientId: process.env.MICROSOFT_CLIENT_ID?.trim() || null,
  msClientSecret: process.env.MICROSOFT_CLIENT_SECRET?.trim() || null,
  msTenantId: process.env.MICROSOFT_TENANT_ID?.trim() || "common",
  linkedinClientId: process.env.LINKEDIN_CLIENT_ID?.trim() || null,
  linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET?.trim() || null,
  /** Access token for LinkedIn's Member Data Portability API, created by hand in LinkedIn's token tool */
  linkedinAccessToken: process.env.LINKEDIN_ACCESS_TOKEN?.trim() || null,
  /**
   * Token for Apify, the third-party service that reads who liked and commented on the owner's
   * LinkedIn posts. LinkedIn's official API does not offer that, so this part is not official.
   */
  apifyToken: process.env.APIFY_TOKEN?.trim() || null,
  dataDir: process.env.NAVET_DATA_DIR || null,
  /** Optional password that protects the whole app */
  appPassword: process.env.APP_PASSWORD || null,
  /** Secret token for the voice/assistant API used by Tasker and other automations */
  apiToken: process.env.NAVET_API_TOKEN || null,
  /** Time zone used for "idag"/"imorgon" when there is no browser (e.g. Tasker) */
  timeZone: process.env.NAVET_TIMEZONE || "Europe/Stockholm",
  /** Show sample data and a simulated Google Tasks instead of the personal workspace */
  demoMode: process.env.NAVET_DEMO === "1",
  isProd: process.env.NODE_ENV === "production",
};

/** Secure cookies whenever the app is served over https (always in production unless APP_URL is plain http). */
export const secureCookies = () => (env.appUrl ? env.appUrl.startsWith("https://") : env.isProd);

export const googleConfigured = () => Boolean(env.googleClientId && env.googleClientSecret);
export const supabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
export const outlookConfigured = () => Boolean(env.msClientId && env.msClientSecret);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Spots a mis-pasted MICROSOFT_CLIENT_SECRET from its shape alone, without revealing it.
 * Entra shows two things for a secret: "Value" (the secret, about 40 characters) and
 * "Secret ID" (a GUID). Pasting the ID is the classic mistake and gives AADSTS7000215.
 */
export function msSecretProblem(): "secret_id" | "quoted" | "too_short" | null {
  const secret = env.msClientSecret;
  if (!secret) return null;
  if (GUID.test(secret)) return "secret_id";
  if (/^["'].*["']$/.test(secret)) return "quoted";
  if (secret.length < 20) return "too_short";
  return null;
}

/** Non-secret description of the configured secret, for the server log. */
export const msSecretShape = () => `längd ${env.msClientSecret?.length ?? 0}, ${msSecretProblem() ?? "ser ut som ett Value"}`;

export const linkedinConfigured = () => Boolean(env.linkedinClientId && env.linkedinClientSecret);

/** LinkedIn contacts are read with a token from LinkedIn's own token tool, not through OAuth in Navet. */
export const linkedinTokenConfigured = () => Boolean(env.linkedinAccessToken);

/**
 * Spots a mis-pasted LINKEDIN_ACCESS_TOKEN from its shape alone, without revealing it.
 * A LinkedIn access token is one long string without spaces (several hundred characters).
 */
export function linkedinTokenProblem(): "quoted" | "bearer_prefix" | "whitespace" | "too_short" | null {
  const token = env.linkedinAccessToken;
  if (!token) return null;
  if (/^["'].*["']$/.test(token)) return "quoted";
  if (/^bearer\s/i.test(token)) return "bearer_prefix";
  if (/\s/.test(token)) return "whitespace";
  if (token.length < 40) return "too_short";
  return null;
}

export const apifyConfigured = () => Boolean(env.apifyToken);

/** Spots a mis-pasted APIFY_TOKEN from its shape alone, without revealing it. */
export function apifyTokenProblem(): "quoted" | "bearer_prefix" | "whitespace" | "too_short" | null {
  const token = env.apifyToken;
  if (!token) return null;
  if (/^["'].*["']$/.test(token)) return "quoted";
  if (/^bearer\s/i.test(token)) return "bearer_prefix";
  if (/\s/.test(token)) return "whitespace";
  if (token.length < 20) return "too_short";
  return null;
}

/** True when Navet is reachable from the internet (Vercel, or an https APP_URL that isn't localhost). */
export function isPublicDeployment(): boolean {
  if (process.env.VERCEL) return true;
  if (!env.appUrl) return false;
  try {
    const { protocol, hostname } = new URL(env.appUrl);
    return protocol === "https:" && hostname !== "localhost" && hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Integrations give access to mail, calendar and LinkedIn. On a public deployment they are
 * only served when the whole app is behind APP_PASSWORD – otherwise anyone with the link
 * could read the connected accounts.
 */
export const integrationsUnlocked = () => Boolean(env.appPassword) || !isPublicDeployment();

/** In production the secret that encrypts stored tokens must be set explicitly. */
export const sessionSecretOk = () => Boolean(env.sessionSecret && env.sessionSecret.length >= 32) || !env.isProd;

export function sessionSecret(): string {
  if (env.sessionSecret && env.sessionSecret.length >= 32) return env.sessionSecret;
  if (env.isProd && (googleConfigured() || outlookConfigured() || linkedinConfigured())) {
    throw new Error("SESSION_SECRET måste vara satt (minst 32 tecken) i produktion.");
  }
  // Development fallback so the app runs without configuration.
  return "navet-dev-only-insecure-session-secret-change-me";
}

export function appUrl(req: Request): string {
  if (env.appUrl) return env.appUrl;
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

/**
 * "Now" as wall-clock time in the user's time zone. The server runs in UTC, but date
 * logic ("idag", "på torsdag") must follow the user's calendar.
 */
export function userNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: env.timeZone }));
}
