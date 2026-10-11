import "server-only";
import { createHash } from "node:crypto";
import type { LinkedInContact } from "../../types";
import { env, integrationsUnlocked, linkedinTokenConfigured } from "../../server/env";
import { OWNER_ID } from "../../server/session";
import type { NavetStore } from "../../server/store";
import type { IntegrationState } from "../types";
import { LinkedInAuthError, fetchSnapshotPage, type SnapshotRow } from "./api";
import { describeFields, detectFields, hasNameField, toContact, type FieldMap } from "./connections";

const DOMAIN = "CONNECTIONS";
const STATE_KEY = "linkedin_state";
const CONTACTS_KEY = "linkedin_contacts";

const DAY_MS = 86400_000;
/** LinkedIn documents neither refresh rate nor rate limits, so Navet fetches on its own at most once a day. */
export const AUTO_SYNC_INTERVAL_MS = DAY_MS;
/** A manual fetch is allowed this soon after the previous attempt (stops double clicks). */
const MANUAL_COOLDOWN_MS = 30_000;
/** A fetch that started longer ago than this is taken to have died with its server instance. */
const SYNC_LOCK_MS = 120_000;
/** Stop before the server's time limit (maxDuration 60 s on the route) and keep what has arrived. */
const TIME_BUDGET_MS = 45_000;
const MAX_PAGES = 2000;
/** A complete list replaces the stored one only if it is at least this large a share of it. */
const REPLACE_MIN_SHARE = 0.5;
/** The token is valid for up to a year. Navet reminds about it from this age. */
const TOKEN_WARN_DAYS = 335;

/** Not secret: how the last fetch went. The token itself is only ever read from the environment. */
export interface LinkedInState {
  /** Shortened SHA-256 of the token in use, to notice when it is replaced. Never the token. */
  tokenHash: string | null;
  /** When Navet first saw the current token */
  tokenSeenAt: string | null;
  lastAttemptAt: string | null;
  /** Last time contacts were fetched successfully */
  lastSyncAt: string | null;
  lastError: string | null;
  needsReauth: boolean;
  /** LinkedIn accepted the token but has no snapshot of the contacts ready yet */
  pending: boolean;
  /** The last fetch stopped before all pages were read */
  partial: boolean;
  count: number;
  /** The field names LinkedIn returned for CONNECTIONS (names only, no values) */
  fieldKeys: string[];
  fieldMap: FieldMap | null;
  syncingSince: string | null;
}

const emptyState = (): LinkedInState => ({
  tokenHash: null,
  tokenSeenAt: null,
  lastAttemptAt: null,
  lastSyncAt: null,
  lastError: null,
  needsReauth: false,
  pending: false,
  partial: false,
  count: 0,
  fieldKeys: [],
  fieldMap: null,
  syncingSince: null,
});

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 16);

const saveState = (store: NavetStore, state: LinkedInState) => store.setKV(OWNER_ID, STATE_KEY, state);

/**
 * The stored state, adjusted to the token on the server right now: a replaced token starts
 * with a clean slate (no old "token rejected"), and its age is counted from today.
 */
export async function loadLinkedInState(store: NavetStore): Promise<LinkedInState> {
  const state = { ...emptyState(), ...((await store.getKV<Partial<LinkedInState>>(OWNER_ID, STATE_KEY)) ?? {}) };
  const token = env.linkedinAccessToken;
  if (!token) return state;
  const hash = tokenHash(token);
  if (state.tokenHash === hash) return state;
  const next: LinkedInState = { ...state, tokenHash: hash, tokenSeenAt: new Date().toISOString(), needsReauth: false, lastError: null, pending: false, lastAttemptAt: null, syncingSince: null };
  await saveState(store, next);
  return next;
}

export async function linkedinFeatureStatus(store: NavetStore): Promise<{ state: IntegrationState; info: LinkedInState }> {
  if (!linkedinTokenConfigured()) return { state: "not_configured", info: emptyState() };
  if (!integrationsUnlocked()) return { state: "locked", info: emptyState() };
  const info = await loadLinkedInState(store);
  if (info.needsReauth) return { state: "needs_reauth", info };
  return { state: info.lastError ? "error" : "connected", info };
}

/** A reminder when the token is getting close to its one-year limit, otherwise null. */
export function tokenAgeWarning(info: LinkedInState, now = Date.now()): string | null {
  if (!info.tokenSeenAt) return null;
  const days = Math.floor((now - Date.parse(info.tokenSeenAt)) / DAY_MS);
  if (days < TOKEN_WARN_DAYS) return null;
  return `Åtkomsttoken har använts i ${days} dagar och gäller i högst ett år. Skapa en ny i LinkedIns tokenverktyg, byt LINKEDIN_ACCESS_TOKEN och gör en ny deploy innan den slutar fungera.`;
}

const byName = (a: LinkedInContact, b: LinkedInContact) => a.name.localeCompare(b.name, "sv");

export async function loadContacts(store: NavetStore): Promise<LinkedInContact[]> {
  return (await store.getKV<{ contacts: LinkedInContact[] }>(OWNER_ID, CONTACTS_KEY))?.contacts ?? [];
}

/**
 * Saves fetched contacts without creating duplicates. A complete fetch is LinkedIn's whole
 * list and replaces the stored one, so removed connections disappear. An interrupted fetch
 * only adds and updates, and so does a "complete" list that is suspiciously short compared
 * with what is stored (LinkedIn builds snapshots in the background and may answer before it
 * is done). Either way a contact keeps the date Navet first saw it.
 */
async function storeContacts(store: NavetStore, fetched: LinkedInContact[], complete: boolean): Promise<{ count: number; replaced: boolean }> {
  const existing = await loadContacts(store);
  const known = new Map(existing.map((c) => [c.id, c]));
  const replaced = complete && fetched.length >= existing.length * REPLACE_MIN_SHARE;
  const merged = new Map<string, LinkedInContact>(replaced ? [] : known);
  for (const c of fetched) merged.set(c.id, { ...c, firstSeenAt: known.get(c.id)?.firstSeenAt ?? c.firstSeenAt });
  const contacts = [...merged.values()].sort(byName);
  await store.setKV(OWNER_ID, CONTACTS_KEY, { contacts });
  return { count: contacts.length, replaced };
}

export interface ContactQuery {
  q?: string;
  limit?: number;
  offset?: number;
}

/** Search in name and company. Every word in the query has to match one of them. */
export function filterContacts(contacts: LinkedInContact[], q: string | undefined): LinkedInContact[] {
  const words = (q ?? "").toLocaleLowerCase("sv").split(/\s+/).filter(Boolean);
  if (!words.length) return contacts;
  return contacts.filter((c) => {
    const hay = `${c.name} ${c.company ?? ""}`.toLocaleLowerCase("sv");
    return words.every((w) => hay.includes(w));
  });
}

export async function queryContacts(store: NavetStore, { q, limit = 100, offset = 0 }: ContactQuery) {
  const all = await loadContacts(store);
  const matching = filterContacts(all, q);
  return { contacts: matching.slice(offset, offset + limit), matching: matching.length, total: all.length };
}

export interface SyncResult {
  ok: boolean;
  message: string;
  /** The automatic fetch was not due, or another fetch is already running: nothing was done */
  skipped?: boolean;
}

/** True when the daily automatic fetch should run. A rejected token is not retried until it is replaced. */
export function autoSyncDue(info: LinkedInState, now = Date.now()): boolean {
  if (info.needsReauth) return false;
  return !info.lastAttemptAt || now - Date.parse(info.lastAttemptAt) >= AUTO_SYNC_INTERVAL_MS;
}

/** Every field name on the page, in the order first seen. A row may leave out fields that are empty. */
const rowKeys = (rows: SnapshotRow[]) => [...new Set(rows.flatMap((r) => Object.keys(r)))];

function logFields(keys: string[], previous: string[]) {
  if (keys.join("|") === previous.join("|")) return;
  // Field names only. Values (names, companies) are never written to the log.
  console.info(`[navet] linkedin ${DOMAIN} fält: ${keys.join(", ")}`);
}

// One fetch at a time per server instance; the stored syncingSince covers other instances.
let running: Promise<SyncResult> | null = null;

/**
 * Fetches all pages of the contact list from LinkedIn and stores them.
 * mode "auto" does nothing unless a day has passed since the last attempt.
 */
export function syncLinkedInContacts(store: NavetStore, mode: "manual" | "auto"): Promise<SyncResult> {
  if (running) return mode === "auto" ? Promise.resolve({ ok: true, skipped: true, message: "En hämtning pågår redan." }) : running;
  running = runSync(store, mode).finally(() => {
    running = null;
  });
  return running;
}

async function runSync(store: NavetStore, mode: "manual" | "auto"): Promise<SyncResult> {
  const { state, info } = await linkedinFeatureStatus(store);
  if (state === "not_configured") return { ok: false, message: "LINKEDIN_ACCESS_TOKEN saknas på servern. Det finns inget att hämta med." };
  if (state === "locked") return { ok: false, message: "Integrationer är avstängda tills Navet har ett lösenord (APP_PASSWORD)." };
  const token = env.linkedinAccessToken!;
  const startedAt = Date.now();

  if (mode === "auto" && !autoSyncDue(info, startedAt)) return { ok: true, skipped: true, message: "Kontakterna har redan hämtats det senaste dygnet." };
  if (info.syncingSince && startedAt - Date.parse(info.syncingSince) < SYNC_LOCK_MS) {
    return { ok: true, skipped: true, message: "En hämtning pågår redan. Vänta en stund och ladda om." };
  }
  if (mode === "manual" && info.lastAttemptAt && startedAt - Date.parse(info.lastAttemptAt) < MANUAL_COOLDOWN_MS) {
    return { ok: true, skipped: true, message: "Kontakterna hämtades alldeles nyss. Vänta en halv minut innan du hämtar igen." };
  }

  const nowIso = new Date(startedAt).toISOString();
  let current: LinkedInState = { ...info, lastAttemptAt: nowIso, syncingSince: nowIso };
  await saveState(store, current);

  const fetched = new Map<string, LinkedInContact>();
  let rowCount = 0;
  let keys: string[] = current.fieldKeys;
  let map: FieldMap | null = null;
  let complete = false;
  let outOfTime = false;
  let failure: unknown = null;

  try {
    let start = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        outOfTime = true;
        break;
      }
      const res = await fetchSnapshotPage(token, DOMAIN, start);
      if (!res) {
        complete = true;
        break;
      }
      if (res.rows.length && !map) {
        keys = rowKeys(res.rows);
        map = detectFields(keys);
        logFields(keys, current.fieldKeys);
      }
      rowCount += res.rows.length;
      const before = fetched.size;
      if (map) {
        for (const row of res.rows) {
          const c = toContact(row, map, nowIso);
          if (c) fetched.set(c.id, c);
        }
      }
      // No "next" link: LinkedIn says to go on until it answers "no data". A page that adds
      // nothing new (empty, or the same page again) is treated as the end as well.
      if (res.nextStart === null && fetched.size === before) {
        complete = true;
        break;
      }
      const next = res.nextStart ?? start + 1;
      if (next <= start) {
        complete = true;
        break;
      }
      start = next;
    }
  } catch (err) {
    failure = err;
  }

  current = { ...current, syncingSince: null, fieldKeys: keys, fieldMap: map ?? current.fieldMap };
  const fields = map ? describeFields(keys, map) : "";
  const finish = async (patch: Partial<LinkedInState>, result: SyncResult): Promise<SyncResult> => {
    await saveState(store, { ...current, ...patch });
    return result;
  };

  try {
    // Nothing usable arrived.
    if (!fetched.size) {
      if (failure) {
        const message = (failure as Error)?.message || "Kunde inte hämta kontakter från LinkedIn.";
        return await finish({ lastError: message, needsReauth: failure instanceof LinkedInAuthError }, { ok: false, message });
      }
      if (rowCount > 0) {
        const message = `LinkedIn svarade med ${rowCount} rader, men Navet känner inte igen något namnfält i dem och har därför inte sparat något. ${fields}`.trim();
        return await finish({ lastError: message, pending: false }, { ok: false, message });
      }
      // The token was accepted but there is no data: LinkedIn builds the snapshot when the token
      // is created, and it can take a while. Stored contacts are left untouched.
      return await finish(
        { lastError: null, needsReauth: false, pending: true },
        {
          ok: true,
          message: "LinkedIn godkänner åtkomsttoken, men kontaktlistan är inte klar än. LinkedIn sammanställer den när token skapas och det kan dröja. Försök igen senare.",
        },
      );
    }

    const allRead = complete && !failure && !outOfTime;
    const { count, replaced } = await storeContacts(store, [...fetched.values()], allRead);
    const skipped = rowCount - fetched.size;
    const summary = `${fetched.size} kontakter hämtades från LinkedIn${skipped > 0 ? ` (${skipped} rader utan namn eller dubbletter hoppades över)` : ""}.`;
    const base: Partial<LinkedInState> = { count, lastSyncAt: new Date().toISOString(), pending: false, partial: !replaced };

    if (failure) {
      const reason = (failure as Error)?.message || "Okänt fel";
      const message = `Hämtningen avbröts: ${reason} ${summary} De har sparats, resten hämtas nästa gång.`;
      return await finish({ ...base, lastError: reason, needsReauth: failure instanceof LinkedInAuthError }, { ok: false, message });
    }
    if (outOfTime) {
      const message = `${summary} Listan är längre än vad som hinner hämtas på en gång. Tryck Hämta om för att fortsätta.`;
      return await finish({ ...base, lastError: null, needsReauth: false }, { ok: true, message });
    }
    const kept = replaced ? "" : ` Listan var mycket kortare än den sparade (${count} kontakter), så de sparade kontakterna har behållits. LinkedIn kan ha svarat innan sammanställningen var klar.`;
    return await finish({ ...base, lastError: null, needsReauth: false }, { ok: true, message: `${summary}${kept} ${fields}`.trim() });
  } catch (err) {
    // Saving failed (the database, not LinkedIn). Release the lock so the next attempt can run.
    const message = (err as Error)?.message || "Kunde inte spara kontakterna.";
    await saveState(store, { ...current, lastError: message }).catch(() => undefined);
    return { ok: false, message };
  }
}

/**
 * "Testa anslutningen": reads the first page only and reports what came back, including the
 * field names. Saves nothing but the status.
 */
export async function testLinkedIn(store: NavetStore): Promise<SyncResult> {
  const { state, info } = await linkedinFeatureStatus(store);
  if (state === "not_configured") return { ok: false, message: "Ej konfigurerad. LINKEDIN_ACCESS_TOKEN saknas på servern." };
  if (state === "locked") return { ok: false, message: "Avstängd. Det finns inget att testa mot." };
  try {
    const page = await fetchSnapshotPage(env.linkedinAccessToken!, DOMAIN, 0);
    if (!page || !page.rows.length) {
      await saveState(store, { ...info, lastError: null, needsReauth: false, pending: true });
      return { ok: true, message: "LinkedIn godkänner åtkomsttoken, men kontaktlistan är inte klar än. LinkedIn sammanställer den när token skapas och det kan dröja. Försök igen senare." };
    }
    const keys = rowKeys(page.rows);
    const map = detectFields(keys);
    logFields(keys, info.fieldKeys);
    const fields = describeFields(keys, map);
    if (!hasNameField(map)) {
      const message = `LinkedIn svarade med ${page.rows.length} rader, men Navet känner inte igen något namnfält i dem. ${fields}`;
      await saveState(store, { ...info, fieldKeys: keys, fieldMap: map, lastError: message, needsReauth: false, pending: false });
      return { ok: false, message };
    }
    await saveState(store, { ...info, fieldKeys: keys, fieldMap: map, lastError: null, needsReauth: false, pending: false });
    return { ok: true, message: `Anslutningen fungerar. Första sidan innehåller ${page.rows.length} kontakter. ${fields}` };
  } catch (err) {
    const message = (err as Error)?.message || "Testet misslyckades.";
    await saveState(store, { ...info, lastError: message, needsReauth: err instanceof LinkedInAuthError });
    return { ok: false, message };
  }
}
