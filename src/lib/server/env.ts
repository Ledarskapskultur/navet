import "server-only";

// All secrets are read server-side only. Nothing here is exposed to the browser.
export const env = {
  appUrl: process.env.APP_URL?.replace(/\/$/, "") || null,
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
  sessionSecret: process.env.SESSION_SECRET || null,
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  msClientId: process.env.MICROSOFT_CLIENT_ID || null,
  msClientSecret: process.env.MICROSOFT_CLIENT_SECRET || null,
  msTenantId: process.env.MICROSOFT_TENANT_ID || "common",
  dataDir: process.env.NAVET_DATA_DIR || null,
  isProd: process.env.NODE_ENV === "production",
};

/** Secure cookies whenever the app is served over https (always in production unless APP_URL is plain http). */
export const secureCookies = () => (env.appUrl ? env.appUrl.startsWith("https://") : env.isProd);

export const googleConfigured = () => Boolean(env.googleClientId && env.googleClientSecret);
export const supabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
export const outlookConfigured = () => Boolean(env.msClientId && env.msClientSecret);

export function sessionSecret(): string {
  if (env.sessionSecret && env.sessionSecret.length >= 32) return env.sessionSecret;
  if (env.isProd && googleConfigured()) {
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
