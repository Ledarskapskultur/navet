// Shared by proxy.ts and the login route. Uses Web Crypto so it runs in any runtime.
// The cookie holds an HMAC of the password, so it can't be forged without knowing the
// password, and changing APP_PASSWORD logs every device out.

export const LOCK_COOKIE = "navet_auth";
export const LOCK_MAX_AGE = 60 * 60 * 24 * 365;

export async function lockToken(password: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`navet-auth:${password}`));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function lockSecret(): string {
  return process.env.SESSION_SECRET || "navet-app-lock";
}
