import "server-only";
import { env } from "../../server/env";

/** Delegated permissions Navet asks for – read-only calendar and mail. */
export const MS_SCOPES = ["openid", "profile", "offline_access", "User.Read", "Calendars.Read", "Mail.Read"];

const base = () => `https://login.microsoftonline.com/${env.msTenantId}/oauth2/v2.0`;

export const msRedirectUri = (appBase: string) => `${appBase}/api/auth/microsoft/callback`;

export function buildMsAuthUrl(opts: { baseUrl: string; state: string; codeChallenge: string }) {
  const q = new URLSearchParams({
    client_id: env.msClientId!,
    response_type: "code",
    redirect_uri: msRedirectUri(opts.baseUrl),
    response_mode: "query",
    scope: MS_SCOPES.join(" "),
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${base()}/authorize?${q}`;
}

export interface MsTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

async function token(body: Record<string, string>): Promise<MsTokenResponse> {
  const res = await fetch(`${base()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.msClientId!, client_secret: env.msClientSecret!, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Microsoft-inloggning misslyckades: ${data.error_description ?? res.status}`);
  return data as MsTokenResponse;
}

export function exchangeMsCode(opts: { code: string; baseUrl: string; codeVerifier: string }) {
  return token({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: msRedirectUri(opts.baseUrl),
    code_verifier: opts.codeVerifier,
    scope: MS_SCOPES.join(" "),
  });
}

export function refreshMsToken(refreshToken: string) {
  return token({ grant_type: "refresh_token", refresh_token: refreshToken, scope: MS_SCOPES.join(" ") });
}
