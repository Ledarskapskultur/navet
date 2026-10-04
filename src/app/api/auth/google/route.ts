import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthUrl } from "@/lib/integrations/google/oauth";
import { appUrl, googleConfigured, secureCookies, sessionSecret } from "@/lib/server/env";
import { randomToken, sha256base64url } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

/** Starts the Google OAuth flow (authorization code + PKCE). */
export async function GET(req: Request) {
  const base = appUrl(req);
  if (!googleConfigured()) {
    return NextResponse.redirect(`${base}/installningar?error=google_not_configured`);
  }
  try {
    sessionSecret();
  } catch {
    return NextResponse.redirect(`${base}/installningar?error=session_secret`);
  }
  const state = randomToken(24);
  const verifier = randomToken(48);
  const jar = await cookies();
  const opts = { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/", maxAge: 600 };
  jar.set("navet_oauth_state", state, opts);
  jar.set("navet_oauth_verifier", verifier, opts);
  return NextResponse.redirect(buildAuthUrl({ baseUrl: base, state, codeChallenge: sha256base64url(verifier) }));
}
