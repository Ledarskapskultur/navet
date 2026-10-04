import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeIdToken, exchangeCode } from "@/lib/integrations/google/oauth";
import { appUrl } from "@/lib/server/env";
import { writeSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = appUrl(req);
  const url = new URL(req.url);
  const jar = await cookies();
  const expectedState = jar.get("navet_oauth_state")?.value;
  const verifier = jar.get("navet_oauth_verifier")?.value;
  jar.delete("navet_oauth_state");
  jar.delete("navet_oauth_verifier");

  const error = url.searchParams.get("error");
  if (error) return NextResponse.redirect(`${base}/installningar?error=${encodeURIComponent(error)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return NextResponse.redirect(`${base}/installningar?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCode({ code, baseUrl: base, codeVerifier: verifier });
    if (!tokens.id_token) throw new Error("id_token saknas");
    if (!tokens.scope.includes("https://www.googleapis.com/auth/tasks")) {
      return NextResponse.redirect(`${base}/installningar?error=tasks_scope_missing`);
    }
    const profile = decodeIdToken(tokens.id_token);
    await writeSession({
      user: { id: profile.sub, email: profile.email, name: profile.name ?? profile.email, picture: profile.picture },
      google: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        scope: tokens.scope,
      },
    });
    return NextResponse.redirect(`${base}/google-tasks?connected=1`);
  } catch (err) {
    console.error("[navet] OAuth callback", err);
    return NextResponse.redirect(`${base}/installningar?error=token_exchange`);
  }
}
