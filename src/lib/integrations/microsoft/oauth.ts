import "server-only";
import { env } from "../../server/env";

const base = () => `https://login.microsoftonline.com/${env.msTenantId}/oauth2/v2.0`;

export const msRedirectUri = (appBase: string) => `${appBase}/api/auth/microsoft/callback`;

/** An error from Microsoft's sign-in service, with Microsoft's own error code (e.g. invalid_grant). */
export class MsOAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Codes that mean "the stored sign-in is no longer valid – the user has to connect again". */
const REAUTH_CODES = new Set(["invalid_grant", "interaction_required", "consent_required", "login_required"]);
export const needsReauth = (err: unknown) => err instanceof MsOAuthError && REAUTH_CODES.has(err.code);

export function buildMsAuthUrl(opts: {
  baseUrl: string;
  state: string;
  codeChallenge: string;
  scopes: string[];
  /** The account that is already connected – skips the account picker when adding a permission */
  loginHint?: string | null;
}) {
  const q = new URLSearchParams({
    client_id: env.msClientId!,
    response_type: "code",
    redirect_uri: msRedirectUri(opts.baseUrl),
    response_mode: "query",
    scope: opts.scopes.join(" "),
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  // First connection: let the user pick the account. Adding a permission: stay on the same
  // account; Microsoft shows the consent screen by itself when something new is asked for.
  if (opts.loginHint) q.set("login_hint", opts.loginHint);
  else q.set("prompt", "select_account");
  return `${base()}/authorize?${q}`;
}

export interface MsTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  /** Space separated list of what was actually granted */
  scope: string;
}

async function token(body: Record<string, string>): Promise<MsTokenResponse> {
  let res: Response;
  try {
    res = await fetch(`${base()}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.msClientId!, client_secret: env.msClientSecret!, ...body }),
      cache: "no-store",
    });
  } catch {
    throw new MsOAuthError("network", "Kunde inte nå Microsofts inloggningstjänst.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
  if (!res.ok) {
    // error_description can contain trace ids but never tokens; keep the first line for the log.
    const detail = data.error_description?.split(/\r?\n/)[0] ?? `HTTP ${res.status}`;
    throw new MsOAuthError(data.error ?? `http_${res.status}`, `Microsoft-inloggning misslyckades: ${detail}`);
  }
  return data as MsTokenResponse;
}

export function exchangeMsCode(opts: { code: string; baseUrl: string; codeVerifier: string }) {
  return token({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: msRedirectUri(opts.baseUrl),
    code_verifier: opts.codeVerifier,
  });
}

/** Without a scope parameter Microsoft returns a token for everything granted so far. */
export function refreshMsToken(refreshToken: string) {
  return token({ grant_type: "refresh_token", refresh_token: refreshToken });
}
