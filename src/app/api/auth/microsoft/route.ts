import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadMsConnection } from "@/lib/integrations/microsoft/connection";
import { buildMsAuthUrl } from "@/lib/integrations/microsoft/oauth";
import { MS_OAUTH_COOKIE, safeReturnPath, type MsOAuthFlow } from "@/lib/integrations/microsoft/flow";
import { MS_DEFAULT_GRANT, msScopesForRequest, msScopesInUse, parseMsGrant } from "@/lib/integrations/microsoft/scopes";
import { encrypt, randomToken, sha256base64url } from "@/lib/server/crypto";
import { appUrl, integrationsUnlocked, outlookConfigured, secureCookies, sessionSecretOk } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * Starts "Anslut konto" against Microsoft Entra ID (authorization code + PKCE).
 *
 *   /api/auth/microsoft?grant=mail_read            connect Outlook mail
 *   /api/auth/microsoft?grant=calendar_read        connect the calendar
 *
 * Permissions that are in use are kept, so connecting the calendar after the mail only
 * adds what is new (incremental consent).
 */
export async function GET(req: Request) {
  const base = appUrl(req);
  const q = new URL(req.url).searchParams;
  const returnTo = safeReturnPath(q.get("return"));
  const fail = (code: string) => NextResponse.redirect(`${base}/integrationer?error=${code}`);

  // Connecting changes what Navet may read, so it must be started from Navet itself. Browsers
  // mark where a navigation came from; a link on another site (cross-site) is refused.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return fail("cross_site");

  if (!outlookConfigured()) return fail("outlook_not_configured");
  if (!sessionSecretOk()) return fail("session_secret");
  if (!integrationsUnlocked()) return fail("app_password_required");

  const store = await getStore();
  const existing = await loadMsConnection(store);
  // Without an explicit grant (the old "Koppla Outlook" link) both mail and calendar are read.
  const requested = parseMsGrant(q.get("grant"));
  const grant = requested.length ? requested : [MS_DEFAULT_GRANT.mail, MS_DEFAULT_GRANT.calendar];

  const flow: MsOAuthFlow = { state: randomToken(24), verifier: randomToken(48), grant, returnTo };
  const jar = await cookies();
  jar.set(MS_OAUTH_COOKIE, encrypt(flow), { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/", maxAge: 600 });

  return NextResponse.redirect(
    buildMsAuthUrl({
      baseUrl: base,
      state: flow.state,
      codeChallenge: sha256base64url(flow.verifier),
      // Keep what is in use; a part that was disconnected is not asked for again.
      scopes: msScopesForRequest(existing ? msScopesInUse(existing.scopes, existing.features) : [], grant),
      loginHint: existing?.account.email ?? null,
    }),
  );
}
