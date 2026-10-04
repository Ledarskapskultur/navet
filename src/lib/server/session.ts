import "server-only";
import { cookies } from "next/headers";
import type { SessionUser } from "../types";
import { decrypt, encrypt } from "./crypto";
import { env, secureCookies } from "./env";

export const SESSION_COOKIE = "navet_session";
const MAX_AGE = 60 * 60 * 24 * 180;

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  /** epoch ms */
  expiresAt: number;
  scope: string;
}

export interface Session {
  user: SessionUser;
  google: GoogleTokens;
}

// Navet is a single-person workspace: the personal and Google modes share the same
// data ("me"), so connecting or disconnecting Google never hides anything, and
// booking requests from landing pages always land in the same inbox.
export const OWNER_ID = "me";

export type RequestContext =
  | { mode: "google"; userId: typeof OWNER_ID; session: Session }
  | { mode: "personal"; userId: "me"; session: null }
  | { mode: "demo"; userId: "demo"; session: null };

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decrypt<Session>(raw);
}

export async function writeSession(session: Session): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encrypt(session), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getContext(): Promise<RequestContext> {
  const session = await readSession();
  if (session) return { mode: "google", userId: OWNER_ID, session };
  if (env.demoMode) return { mode: "demo", userId: "demo", session: null };
  // Default: Navet on its own, no Google account needed.
  return { mode: "personal", userId: "me", session: null };
}
