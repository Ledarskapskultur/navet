import "server-only";
import { env } from "../../server/env";
import { GoogleAuthError } from "./types";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/tasks",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export function redirectUri(baseUrl: string) {
  return `${baseUrl}/api/auth/google/callback`;
}

export function buildAuthUrl(opts: { baseUrl: string; state: string; codeChallenge: string; loginHint?: string }) {
  const params = new URLSearchParams({
    client_id: env.googleClientId!,
    redirect_uri: redirectUri(opts.baseUrl),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // gives us a refresh token
    prompt: "consent", // always return refresh token
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${AUTH_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
  token_type: string;
}

export async function exchangeCode(opts: { code: string; baseUrl: string; codeVerifier: string }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
      redirect_uri: redirectUri(opts.baseUrl),
      grant_type: "authorization_code",
      code_verifier: opts.codeVerifier,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange misslyckades: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (res.status === 400 || res.status === 401) throw new GoogleAuthError();
  if (!res.ok) throw new Error(`Google token refresh misslyckades: ${res.status}`);
  return (await res.json()) as TokenResponse;
}

export async function revokeToken(token: string) {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

/** The id_token is received directly from Google's token endpoint over TLS, so decoding is sufficient. */
export function decodeIdToken(idToken: string): { sub: string; email: string; name?: string; picture?: string } {
  const payload = idToken.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}
