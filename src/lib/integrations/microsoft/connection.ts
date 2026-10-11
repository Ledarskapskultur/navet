import "server-only";
import { decrypt, encrypt } from "../../server/crypto";
import type { NavetStore } from "../../server/store";
import { OWNER_ID } from "../../server/session";
import { GraphAuthError } from "./graph";
import { MsOAuthError, needsReauth, refreshMsToken } from "./oauth";
import { MS_LEGACY_SCOPES, normalizeMsScopes, type MsFeature } from "./scopes";

/**
 * The Microsoft connection is stored server-side (encrypted) for the workspace owner, so
 * it works on every device without logging in to Microsoft again on each one. Outlook
 * mail and the Outlook calendar share one sign-in; `features` says which of them Navet
 * is allowed to use.
 */
export interface MsConnection {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  account: { name: string; email: string };
  connectedAt: string;
  /** Graph permissions Microsoft has granted, e.g. ["Calendars.Read", "Mail.Read", "User.Read"] */
  scopes: string[];
  features: Record<MsFeature, boolean>;
}

interface FeatureHealth {
  lastSyncAt: string | null;
  lastError: string | null;
}

/** Not secret: when each part last worked, and whether Microsoft rejected the stored sign-in. */
export interface MsHealth {
  needsReauth: boolean;
  mail: FeatureHealth;
  calendar: FeatureHealth;
}

const KEY = "microsoft_connection";
const HEALTH_KEY = "microsoft_health";
/** A successful call only updates "senaste synkronisering" this often, to keep writes down. */
const HEALTH_WRITE_MS = 60_000;

const emptyHealth = (): MsHealth => ({
  needsReauth: false,
  mail: { lastSyncAt: null, lastError: null },
  calendar: { lastSyncAt: null, lastError: null },
});

export async function saveMsConnection(store: NavetStore, c: MsConnection) {
  await store.setKV(OWNER_ID, KEY, { sealed: encrypt(c) });
}

export async function loadMsConnection(store: NavetStore): Promise<MsConnection | null> {
  const row = await store.getKV<{ sealed: string }>(OWNER_ID, KEY);
  if (!row?.sealed) return null;
  const c = decrypt<Partial<MsConnection> & Pick<MsConnection, "accessToken" | "refreshToken" | "expiresAt" | "account" | "connectedAt">>(
    row.sealed,
  );
  if (!c) return null;
  // Connections saved before permissions were tracked had read access to mail and calendar.
  return {
    ...c,
    scopes: c.scopes ?? [...MS_LEGACY_SCOPES],
    features: c.features ?? { mail: true, calendar: true },
  };
}

export async function deleteMsConnection(store: NavetStore) {
  // The kv table doesn't allow SQL NULL, so an empty seal marks "not connected".
  await store.setKV(OWNER_ID, KEY, { sealed: "" });
  await store.setKV(OWNER_ID, HEALTH_KEY, emptyHealth());
}

/**
 * Switches one part (mail or calendar) off. When nothing is left the tokens are removed.
 * Returns the remaining connection, or null when it was removed entirely.
 */
export async function disableMsFeature(store: NavetStore, feature: MsFeature): Promise<MsConnection | null> {
  const c = await loadMsConnection(store);
  if (!c) return null;
  const features = { ...c.features, [feature]: false };
  if (!features.mail && !features.calendar) {
    await deleteMsConnection(store);
    return null;
  }
  const next = { ...c, features };
  await saveMsConnection(store, next);
  const health = await loadMsHealth(store);
  await store.setKV(OWNER_ID, HEALTH_KEY, { ...health, [feature]: { lastSyncAt: null, lastError: null } });
  return next;
}

export async function loadMsHealth(store: NavetStore): Promise<MsHealth> {
  const h = await store.getKV<Partial<MsHealth>>(OWNER_ID, HEALTH_KEY);
  return { ...emptyHealth(), ...(h ?? {}) };
}

export async function resetMsHealth(store: NavetStore) {
  await store.setKV(OWNER_ID, HEALTH_KEY, emptyHealth());
}

/** Remembers how the last call for a feature went, so the Integrationer page can show it. */
export async function recordMsResult(store: NavetStore, feature: MsFeature, err: unknown) {
  try {
    const health = await loadMsHealth(store);
    if (!err) {
      const prev = health[feature];
      const fresh = prev.lastSyncAt && Date.now() - Date.parse(prev.lastSyncAt) < HEALTH_WRITE_MS;
      if (fresh && !prev.lastError && !health.needsReauth) return;
      await store.setKV(OWNER_ID, HEALTH_KEY, {
        ...health,
        needsReauth: false,
        [feature]: { lastSyncAt: new Date().toISOString(), lastError: null },
      });
      return;
    }
    const reauth = err instanceof GraphAuthError;
    const message = (err as Error)?.message || "Okänt fel";
    if (health[feature].lastError === message && health.needsReauth === (health.needsReauth || reauth)) return;
    await store.setKV(OWNER_ID, HEALTH_KEY, {
      ...health,
      needsReauth: health.needsReauth || reauth,
      [feature]: { ...health[feature], lastError: message },
    });
  } catch (e) {
    // Health is informational only – never let it break the actual request.
    console.error("[navet] microsoft health", e);
  }
}

// Several requests often need a new token at the same moment (the start page loads mail and
// calendar together). They share one refresh instead of racing each other.
let refreshing: Promise<MsConnection> | null = null;

async function refresh(store: NavetStore, c: MsConnection): Promise<MsConnection> {
  const t = await refreshMsToken(c.refreshToken);
  const granted = normalizeMsScopes(t.scope);
  const next: MsConnection = {
    ...c,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? c.refreshToken,
    expiresAt: Date.now() + t.expires_in * 1000,
    scopes: granted.length ? granted : c.scopes,
  };
  await saveMsConnection(store, next);
  return next;
}

/**
 * A valid access token, refreshing (and persisting the rotated refresh token) when needed.
 * Pass the feature to make sure Navet is still allowed to use that part.
 */
export async function msAccessToken(store: NavetStore, feature?: MsFeature): Promise<string> {
  const c = await loadMsConnection(store);
  if (!c || (feature && !c.features[feature])) throw new GraphAuthError("Outlook är inte anslutet.");
  if (c.expiresAt - 60_000 > Date.now()) return c.accessToken;
  try {
    refreshing ??= refresh(store, c).finally(() => {
      refreshing = null;
    });
    return (await refreshing).accessToken;
  } catch (err) {
    if (needsReauth(err)) throw new GraphAuthError();
    if (err instanceof MsOAuthError && (err.code === "invalid_client" || err.code === "unauthorized_client")) {
      throw new Error("Microsoft godkände inte appens klienthemlighet. Den kan ha gått ut – skapa en ny i Entra och uppdatera MICROSOFT_CLIENT_SECRET.");
    }
    throw new Error((err as Error)?.message || "Kunde inte förnya inloggningen hos Microsoft.");
  }
}
