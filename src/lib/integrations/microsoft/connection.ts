import "server-only";
import { decrypt, encrypt } from "../../server/crypto";
import type { NavetStore } from "../../server/store";
import { OWNER_ID } from "../../server/session";
import { GraphAuthError } from "./graph";
import { refreshMsToken } from "./oauth";

/**
 * The Outlook connection is stored server-side (encrypted) for the workspace owner, so
 * it works on every device without logging in to Microsoft again on each one.
 */
interface MsConnection {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  account: { name: string; email: string };
  connectedAt: string;
}

const KEY = "microsoft_connection";

export async function saveMsConnection(store: NavetStore, c: MsConnection) {
  await store.setKV(OWNER_ID, KEY, { sealed: encrypt(c) });
}

export async function loadMsConnection(store: NavetStore): Promise<MsConnection | null> {
  const row = await store.getKV<{ sealed: string }>(OWNER_ID, KEY);
  return row?.sealed ? decrypt<MsConnection>(row.sealed) : null;
}

export async function deleteMsConnection(store: NavetStore) {
  // The kv table doesn't allow SQL NULL, so an empty seal marks "not connected".
  await store.setKV(OWNER_ID, KEY, { sealed: "" });
}

/** A valid access token, refreshing (and persisting the rotated refresh token) when needed. */
export async function msAccessToken(store: NavetStore): Promise<string> {
  const c = await loadMsConnection(store);
  if (!c) throw new GraphAuthError();
  if (c.expiresAt - 60_000 > Date.now()) return c.accessToken;
  try {
    const t = await refreshMsToken(c.refreshToken);
    const next: MsConnection = {
      ...c,
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? c.refreshToken,
      expiresAt: Date.now() + t.expires_in * 1000,
    };
    await saveMsConnection(store, next);
    return next.accessToken;
  } catch {
    throw new GraphAuthError();
  }
}
