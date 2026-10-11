import type { MsScopeGroupId } from "./scopes";

export const MS_OAUTH_COOKIE = "navet_ms_oauth";

/** What is remembered (encrypted, httpOnly) between "Anslut konto" and Microsoft sending the user back. */
export interface MsOAuthFlow {
  state: string;
  verifier: string;
  grant: MsScopeGroupId[];
  returnTo: string;
}

/** Only paths inside Navet – never an address someone else supplied. */
export function safeReturnPath(value: string | null | undefined, fallback = "/integrationer"): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}
