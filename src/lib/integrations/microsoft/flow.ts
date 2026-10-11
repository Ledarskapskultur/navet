import type { MsScopeGroupId } from "./scopes";

export const MS_OAUTH_COOKIE = "navet_ms_oauth";

/** What is remembered (encrypted, httpOnly) between "Anslut konto" and Microsoft sending the user back. */
export interface MsOAuthFlow {
  state: string;
  verifier: string;
  grant: MsScopeGroupId[];
  returnTo: string;
}

/**
 * Only paths inside Navet – never an address someone else supplied. Besides the obvious
 * "//host", control characters are refused: URL parsing drops tabs and newlines, which
 * would turn "/\t/evil.example" into "//evil.example".
 */
export function safeReturnPath(value: string | null | undefined, fallback = "/integrationer"): string {
  if (!value || !/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/.test(value) || value.startsWith("//")) return fallback;
  return value;
}

/** Resolves a return path against the app's own address and refuses anything that leaves it. */
export function returnUrl(path: string, base: string): URL {
  const target = new URL(safeReturnPath(path), base);
  return target.origin === new URL(base).origin ? target : new URL("/integrationer", base);
}
