import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildMsAuthUrl } from "@/lib/integrations/microsoft/oauth";
import { appUrl, outlookConfigured, secureCookies, sessionSecret } from "@/lib/server/env";
import { randomToken, sha256base64url } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

/** Starts "Koppla Outlook" (authorization code + PKCE against Microsoft Entra ID). */
export async function GET(req: Request) {
  const base = appUrl(req);
  if (!outlookConfigured()) return NextResponse.redirect(`${base}/installningar?error=outlook_not_configured`);
  try {
    sessionSecret();
  } catch {
    return NextResponse.redirect(`${base}/installningar?error=session_secret`);
  }
  const state = randomToken(24);
  const verifier = randomToken(48);
  const jar = await cookies();
  const opts = { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/", maxAge: 600 };
  jar.set("navet_ms_state", state, opts);
  jar.set("navet_ms_verifier", verifier, opts);
  return NextResponse.redirect(buildMsAuthUrl({ baseUrl: base, state, codeChallenge: sha256base64url(verifier) }));
}
