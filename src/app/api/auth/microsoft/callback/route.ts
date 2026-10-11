import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeMsCode, MsOAuthError } from "@/lib/integrations/microsoft/oauth";
import { MS_OAUTH_COOKIE, returnUrl, type MsOAuthFlow } from "@/lib/integrations/microsoft/flow";
import { graphMe } from "@/lib/integrations/microsoft/graph";
import { loadMsConnection, resetMsHealth, saveMsConnection } from "@/lib/integrations/microsoft/connection";
import { msFeaturesFor, msScopesInUse, normalizeMsScopes } from "@/lib/integrations/microsoft/scopes";
import { decrypt } from "@/lib/server/crypto";
import { appUrl, integrationsUnlocked } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = appUrl(req);
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = jar.get(MS_OAUTH_COOKIE)?.value;
  const flow = raw ? decrypt<MsOAuthFlow>(raw) : null;
  jar.delete(MS_OAUTH_COOKIE);
  const fail = (code: string) => NextResponse.redirect(`${base}/integrationer?error=${encodeURIComponent(code)}`);

  if (!integrationsUnlocked()) return fail("app_password_required");

  const error = url.searchParams.get("error");
  if (error) {
    console.error("[navet] microsoft oauth", error, url.searchParams.get("error_description")?.split(/\r?\n/)[0]);
    return fail(`ms_${error}`);
  }
  const code = url.searchParams.get("code");
  if (!code || !flow || url.searchParams.get("state") !== flow.state) return fail("invalid_state");

  try {
    const t = await exchangeMsCode({ code, baseUrl: base, codeVerifier: flow.verifier });
    if (!t.refresh_token) throw new MsOAuthError("no_refresh_token", "Ingen refresh token – saknas offline_access?");
    const granted = normalizeMsScopes(t.scope);
    const features = msFeaturesFor(flow.grant, granted);
    // The user (or the tenant) can decline a permission. Then nothing was gained – say so.
    if (!features.length) return fail("ms_scope_missing");

    const account = await graphMe(t.access_token);
    const store = await getStore();
    const previous = await loadMsConnection(store);
    // A different account replaces the old connection; the same account keeps what was on.
    // Accounts are compared by Microsoft's object id (e-mail for connections saved before ids were kept).
    const sameAccount = previous
      ? previous.account.id && account.id
        ? previous.account.id === account.id
        : previous.account.email.toLowerCase() === account.email.toLowerCase()
      : false;
    const on = { mail: false, calendar: false, ...(sameAccount ? previous!.features : {}) };
    for (const f of features) on[f] = true;

    await saveMsConnection(store, {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Date.now() + t.expires_in * 1000,
      account,
      connectedAt: sameAccount ? previous!.connectedAt : new Date().toISOString(),
      scopes: msScopesInUse(granted, on),
      features: on,
    });
    await resetMsHealth(store);

    const back = returnUrl(flow.returnTo, base);
    back.searchParams.set("connected", features.map((f) => (f === "mail" ? "outlook_mail" : "outlook_calendar")).join(","));
    // Tell the user when signing in with another account replaced the previous connection.
    if (previous && !sameAccount) back.searchParams.set("switched", "1");
    return NextResponse.redirect(back);
  } catch (err) {
    console.error("[navet] microsoft callback", (err as Error).message);
    return fail(err instanceof MsOAuthError && err.code === "no_refresh_token" ? "ms_no_refresh_token" : "ms_token_exchange");
  }
}
