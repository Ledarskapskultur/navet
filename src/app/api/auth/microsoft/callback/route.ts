import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeMsCode } from "@/lib/integrations/microsoft/oauth";
import { graphMe } from "@/lib/integrations/microsoft/graph";
import { saveMsConnection } from "@/lib/integrations/microsoft/connection";
import { appUrl } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = appUrl(req);
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("navet_ms_state")?.value;
  const verifier = jar.get("navet_ms_verifier")?.value;
  jar.delete("navet_ms_state");
  jar.delete("navet_ms_verifier");

  const error = url.searchParams.get("error");
  if (error) {
    console.error("[navet] microsoft oauth", error, url.searchParams.get("error_description"));
    return NextResponse.redirect(`${base}/installningar?error=ms_${encodeURIComponent(error)}`);
  }
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected || !verifier) {
    return NextResponse.redirect(`${base}/installningar?error=invalid_state`);
  }

  try {
    const t = await exchangeMsCode({ code, baseUrl: base, codeVerifier: verifier });
    if (!t.refresh_token) throw new Error("Ingen refresh token – saknas offline_access?");
    const account = await graphMe(t.access_token);
    await saveMsConnection(await getStore(), {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Date.now() + t.expires_in * 1000,
      account,
      connectedAt: new Date().toISOString(),
    });
    return NextResponse.redirect(`${base}/kalender?outlook=1`);
  } catch (err) {
    console.error("[navet] microsoft callback", err);
    return NextResponse.redirect(`${base}/installningar?error=ms_token_exchange`);
  }
}
