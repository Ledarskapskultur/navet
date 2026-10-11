import "server-only";
import { createHash } from "node:crypto";
import { getISOWeek, getISOWeekYear } from "date-fns";
import type { EngagedPerson, LeadSegment, LinkedInPost, PostEngager } from "../../types";
import { apifyConfigured, apifyTokenProblem, env, integrationsUnlocked, linkedinTokenConfigured, userNow } from "../../server/env";
import { OWNER_ID } from "../../server/session";
import type { NavetStore } from "../../server/store";
import { ApifyAuthError, ApifyError, fetchPostEngagers, fetchPostTotals, type ApifyRow, type EngagerKind } from "../apify/client";
import { fetchSnapshotRows } from "./api";
import { canon, cleanProfileUrl } from "./connections";
import { POSTS_DOMAIN, describePostFields, detectPostFields, excerpt, manualPost, parsePostDate, toPost } from "./posts";
import { classifySegment, parseSubtitle } from "./segments";
import { loadContacts } from "./sync";

/**
 * Weekly statistics for the owner's own LinkedIn posts: how many reacted and commented, and who.
 * The posts themselves come from LinkedIn's official API. Who liked and commented is not in any
 * official API, so that part goes through the third-party service Apify (see apify/client.ts).
 * Nothing is sent, published or changed on LinkedIn.
 */
const POSTS_KEY = "linkedin_posts";
const STATE_KEY = "linkedin_engagement_state";
const engagersKey = (postId: string) => `linkedin_engagers:${postId}`;

const DAY_MS = 86400_000;
/** Posts this recent are fetched in the weekly run, so every post is read in its first two weeks. */
export const WINDOW_DAYS = 14;
/** Caps per post and fetch. Apify bills per person returned. */
export const LIKERS_LIMIT = 100;
export const COMMENTERS_LIMIT = 50;
/** At most this many posts per run, as a cost guard. */
const MAX_POSTS_PER_RUN = 12;
const MAX_STORED_POSTS = 400;
/**
 * One request starts new posts for this long, then hands the rest to the next request. A post
 * takes at most about 110 seconds, so a request stays inside the route's 300 second limit.
 */
const TIME_BUDGET_MS = 180_000;
/** A post that started longer ago than this is taken to have died with its server instance. */
const BUSY_MS = 150_000;
const MANUAL_COOLDOWN_MS = 30_000;
const POSTS_LIMITS = { maxPages: 60, budgetMs: 25_000 };

interface Job {
  startedAt: string;
  mode: "auto" | "manual";
  /** Post ids still to fetch */
  queue: string[];
  total: number;
  /** Records Apify has returned so far in this run (what the bill is based on) */
  records: number;
  failed: number;
  /** While a post is being fetched: when that attempt is considered dead */
  busyUntil: string | null;
}

export interface EngagementState {
  /** Start of the latest run */
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  /** ISO week ("2026-W42") of the latest completed automatic run */
  lastAutoWeek: string | null;
  /** Day (YYYY-MM-DD) of the latest automatic attempt, so a failing run is retried at most daily */
  lastAutoDay: string | null;
  lastError: string | null;
  /** Something worth knowing that is not an error, e.g. that LinkedIn's post list could not be refreshed */
  notice: string | null;
  apifyRejected: boolean;
  job: Job | null;
  lastRecords: number;
  lastPosts: number;
  /** Field names (never values) seen in the latest responses */
  postFieldKeys: string[];
  engagerFieldKeys: string[];
}

const emptyState = (): EngagementState => ({
  lastRunAt: null,
  lastFinishedAt: null,
  lastAutoWeek: null,
  lastAutoDay: null,
  lastError: null,
  notice: null,
  apifyRejected: false,
  job: null,
  lastRecords: 0,
  lastPosts: 0,
  postFieldKeys: [],
  engagerFieldKeys: [],
});

export async function loadEngagementState(store: NavetStore): Promise<EngagementState> {
  return { ...emptyState(), ...((await store.getKV<Partial<EngagementState>>(OWNER_ID, STATE_KEY)) ?? {}) };
}

const saveState = (store: NavetStore, state: EngagementState) => store.setKV(OWNER_ID, STATE_KEY, state);

export async function loadPosts(store: NavetStore): Promise<LinkedInPost[]> {
  return (await store.getKV<{ posts: LinkedInPost[] }>(OWNER_ID, POSTS_KEY))?.posts ?? [];
}

/** When the post counts as published: its own date, or when the link was added. */
export const postTime = (p: LinkedInPost) => Date.parse(p.publishedAt ?? p.addedAt);
const newestFirst = (a: LinkedInPost, b: LinkedInPost) => postTime(b) - postTime(a);

async function savePosts(store: NavetStore, posts: LinkedInPost[]) {
  await store.setKV(OWNER_ID, POSTS_KEY, { posts: [...posts].sort(newestFirst).slice(0, MAX_STORED_POSTS) });
}

async function loadEngagers(store: NavetStore, postId: string): Promise<PostEngager[]> {
  return (await store.getKV<{ engagers: PostEngager[] }>(OWNER_ID, engagersKey(postId)))?.engagers ?? [];
}

/** "2026-W42" for the week the date falls in, Monday to Sunday. */
export function weekKey(date: Date): string {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, "0")}`;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * True when the weekly automatic fetch should run: nothing fetched yet this week (Monday is the
 * first day), no attempt yet today, and no run in progress. `now` is the owner's wall-clock time.
 */
export function autoDue(state: EngagementState, now: Date = userNow()): boolean {
  if (state.apifyRejected || state.job) return false;
  return state.lastAutoWeek !== weekKey(now) && state.lastAutoDay !== dayKey(now);
}

/** Says what is wrong when APIFY_TOKEN has the wrong shape. Never includes the value. */
export function apifyConfigWarning(): string | null {
  switch (apifyTokenProblem()) {
    case "quoted":
      return "APIFY_TOKEN är omgiven av citattecken. Ta bort citattecknen i Vercel och gör en ny deploy.";
    case "bearer_prefix":
      return "APIFY_TOKEN börjar med ordet Bearer. Lägg bara in själva token i Vercel och gör en ny deploy.";
    case "whitespace":
      return "APIFY_TOKEN innehåller mellanslag eller radbrytningar. Kopiera token från Apify igen, i ett stycke, och gör en ny deploy.";
    case "too_short":
      return "APIFY_TOKEN är kortare än en token brukar vara. Värdet kan ha blivit avklippt: kopiera hela token igen och gör en ny deploy.";
    default:
      return null;
  }
}

// ---- People ----------------------------------------------------------------------------------

const ENGAGER_KEYS = {
  name: ["name", "fullname", "actorname", "authorname"],
  subtitle: ["subtitle", "headline", "position", "occupation", "jobtitle", "description"],
  profile: ["urlprofile", "profileurl", "profilelink", "linkedinurl", "url", "profile"],
  comment: ["content", "text", "comment", "commenttext"],
  at: ["datetime", "date", "createdat", "timestamp", "time"],
} as const;

/** Apify's rows are flat today. If an actor starts nesting the person, the nested fields are lifted up. */
function flatten(row: ApifyRow): ApifyRow {
  const out: ApifyRow = {};
  for (const nested of [row.author, row.actor]) {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) Object.assign(out, nested);
  }
  return Object.assign(out, row);
}

function pick(row: ApifyRow, candidates: readonly string[]): string | null {
  const byCanon = new Map(Object.keys(row).map((k) => [canon(k), k]));
  for (const c of candidates) {
    const v = row[byCanon.get(c) ?? ""];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** Same form as the ids of the fetched contacts, so the two can be matched. */
function personId(profileUrl: string | null, name: string, subtitle: string | null): string {
  if (profileUrl) return `li:${profileUrl.replace(/^https:\/\/(www\.)?/, "").toLowerCase()}`;
  return `li:${createHash("sha256").update(`${name}|${subtitle ?? ""}`.toLowerCase()).digest("hex").slice(0, 20)}`;
}

/** One Apify row as a person, or null when the row has no name. */
export function toEngager(raw: ApifyRow, kind: PostEngager["kind"], now: string): PostEngager | null {
  const row = flatten(raw);
  const name = pick(row, ENGAGER_KEYS.name);
  if (!name) return null;
  const subtitle = pick(row, ENGAGER_KEYS.subtitle);
  const profileUrl = cleanProfileUrl(pick(row, ENGAGER_KEYS.profile));
  return {
    id: personId(profileUrl, name, subtitle),
    name,
    subtitle,
    ...parseSubtitle(subtitle),
    profileUrl,
    kind,
    comment: kind === "commenter" ? excerpt(pick(row, ENGAGER_KEYS.comment)) : null,
    at: parsePostDate(pick(row, ENGAGER_KEYS.at)),
    segment: classifySegment(subtitle),
    firstSeenAt: now,
  };
}

// ---- The owner's posts ---------------------------------------------------------------------

/**
 * Refreshes the list of own posts from LinkedIn's official API and merges it with what is stored.
 * Returns a notice when the list could not be refreshed; the stored posts are then used as they are.
 */
async function refreshPosts(store: NavetStore, now: string): Promise<{ notice: string | null; keys: string[] | null }> {
  if (!linkedinTokenConfigured()) {
    return { notice: "LINKEDIN_ACCESS_TOKEN saknas, så listan över dina inlägg kan inte uppdateras från LinkedIn. Lägg till inlägg genom att klistra in länken.", keys: null };
  }
  try {
    const { rows } = await fetchSnapshotRows(env.linkedinAccessToken!, POSTS_DOMAIN, POSTS_LIMITS);
    if (!rows.length) {
      return { notice: "LinkedIn har inte listan över dina inlägg klar än. LinkedIn sammanställer den när token skapas och det kan dröja. Lägg till inlägg genom att klistra in länken så länge.", keys: null };
    }
    const keys = [...new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r)))];
    const map = detectPostFields(keys);
    if (!map.link) {
      return { notice: `LinkedIn svarade med ${rows.length} inlägg, men Navet känner inte igen fältet med länken. ${describePostFields(keys, map)}`, keys };
    }
    const stored = new Map((await loadPosts(store)).map((p) => [p.id, p]));
    for (const row of rows) {
      const fresh = toPost(row, map, now);
      if (!fresh) continue;
      const old = stored.get(fresh.id);
      stored.set(fresh.id, old ? { ...fresh, addedAt: old.addedAt, stats: old.stats, text: fresh.text ?? old.text, publishedAt: fresh.publishedAt ?? old.publishedAt } : fresh);
    }
    await savePosts(store, [...stored.values()]);
    return { notice: map.date ? null : `Navet hittar inget datumfält för inläggen, så de räknas som publicerade när de först hämtades. ${describePostFields(keys, map)}`, keys };
  } catch (err) {
    return { notice: `Listan över dina inlägg kunde inte uppdateras från LinkedIn: ${(err as Error)?.message || "okänt fel"}`, keys: null };
  }
}

/** Adds a post from a pasted link. Returns null when the link is not a LinkedIn post. */
export async function addManualPost(store: NavetStore, url: string): Promise<LinkedInPost | null> {
  const post = manualPost(url, new Date().toISOString());
  if (!post) return null;
  const posts = await loadPosts(store);
  const existing = posts.find((p) => p.id === post.id);
  if (existing) return existing;
  await savePosts(store, [...posts, post]);
  return post;
}

// ---- Fetching ------------------------------------------------------------------------------

interface PostResult {
  records: number;
  error: string | null;
  /** The whole run should stop: the token is rejected or the credit is used up */
  fatal: unknown;
  keys: string[] | null;
}

const reason = (r: PromiseRejectedResult) => (r.reason as Error)?.message || "okänt fel";
const isFatal = (err: unknown) => err instanceof ApifyAuthError || (err instanceof ApifyError && err.status === 402);

/** Fetches totals, likers and commenters for one post and stores them. Never throws. */
async function fetchPost(store: NavetStore, token: string, post: LinkedInPost, now: string): Promise<PostResult> {
  const kinds: [EngagerKind, PostEngager["kind"], number][] = [
    ["likers", "liker", LIKERS_LIMIT],
    ["commenters", "commenter", COMMENTERS_LIMIT],
  ];
  const [totals, ...lists] = await Promise.allSettled([
    fetchPostTotals(token, post.url),
    ...kinds.map(([kind, , limit]) => fetchPostEngagers(token, post.url, kind, limit)),
  ]);
  const failed = [totals, ...lists].filter((r): r is PromiseRejectedResult => r.status === "rejected");
  const fatal = failed.map((f) => f.reason).find(isFatal) ?? null;

  const existing = await loadEngagers(store, post.id);
  const merged = new Map(existing.map((e) => [`${e.id}|${e.kind}`, e]));
  let records = totals.status === "fulfilled" && totals.value ? 1 : 0;
  let unreadable = 0;
  const seenKeys: string[] = [];
  lists.forEach((list, i) => {
    if (list.status !== "fulfilled") return;
    records += list.value.length;
    if (list.value.length && !seenKeys.length) seenKeys.push(...Object.keys(list.value[0]));
    for (const raw of list.value) {
      const e = toEngager(raw, kinds[i][1], now);
      if (!e) {
        unreadable++;
        continue;
      }
      const key = `${e.id}|${e.kind}`;
      merged.set(key, { ...e, firstSeenAt: merged.get(key)?.firstSeenAt ?? e.firstSeenAt });
    }
  });
  const engagers = [...merged.values()];
  const fetchedRows = lists.reduce((n, l) => n + (l.status === "fulfilled" ? l.value.length : 0), 0);

  let error: string | null = null;
  if (failed.length === lists.length + 1) error = reason(failed[0]);
  else if (fetchedRows > 0 && unreadable === fetchedRows) error = `Apify svarade med ${fetchedRows} rader, men Navet känner inte igen namnfältet i dem. Fält från Apify: ${seenKeys.join(", ")}.`;
  else if (lists.some((l) => l.status === "rejected")) error = `En del av hämtningen misslyckades: ${reason(failed.find((f) => f !== totals) ?? failed[0])}`;
  else if (totals.status === "fulfilled" && !totals.value && !fetchedRows) error = "Inlägget kunde inte läsas. Det kan vara borttaget eller inte synligt för alla.";

  if (engagers.length !== existing.length || fetchedRows) await store.setKV(OWNER_ID, engagersKey(post.id), { engagers });

  const t = totals.status === "fulfilled" ? totals.value : null;
  const posts = await loadPosts(store);
  await savePosts(
    store,
    posts.map((p) =>
      p.id !== post.id
        ? p
        : {
            ...p,
            text: p.text ?? excerpt(t?.text ?? null),
            publishedAt: p.publishedAt ?? parsePostDate(t?.postedAt ?? null),
            stats: {
              fetchedAt: now,
              // A failed fetch keeps the numbers from last time instead of blanking them.
              reactions: t?.reactions ?? p.stats?.reactions ?? null,
              comments: t?.comments ?? p.stats?.comments ?? null,
              shares: t?.shares ?? p.stats?.shares ?? null,
              likersFetched: engagers.filter((e) => e.kind === "liker").length,
              commentersFetched: engagers.filter((e) => e.kind === "commenter").length,
              error,
            },
          },
    ),
  );
  return { records, error, fatal, keys: seenKeys.length ? seenKeys : null };
}

export interface EngagementSyncResult {
  ok: boolean;
  /** False when posts remain: call again to continue */
  done: boolean;
  message: string;
  /** Nothing was done: not due, on cooldown, or another request is fetching right now */
  skipped?: boolean;
  /** Another request is in the middle of a post: wait a little and call again */
  busy?: boolean;
  remaining: number;
}

// One run at a time per server instance; the stored job covers other instances.
let running: Promise<EngagementSyncResult> | null = null;

/**
 * Fetches statistics for the recent posts. Long runs are split over several calls: each call
 * works for a while and reports `done: false` until the queue is empty.
 * mode "auto" only starts a run when none has been made this week.
 */
export function syncEngagement(store: NavetStore, opts: { mode: "auto" | "manual"; postId?: string }): Promise<EngagementSyncResult> {
  if (running) return Promise.resolve({ ok: true, done: false, skipped: true, busy: true, message: "En hämtning pågår redan.", remaining: 0 });
  running = run(store, opts).finally(() => {
    running = null;
  });
  return running;
}

const stop = (message: string): EngagementSyncResult => ({ ok: false, done: true, message, remaining: 0 });

async function run(store: NavetStore, opts: { mode: "auto" | "manual"; postId?: string }): Promise<EngagementSyncResult> {
  if (!integrationsUnlocked()) return stop("Integrationer är avstängda tills Navet har ett lösenord (APP_PASSWORD).");
  if (!apifyConfigured()) return stop("APIFY_TOKEN saknas på servern. Det finns inget att hämta med.");
  const token = env.apifyToken!;
  const started = Date.now();
  const nowIso = new Date(started).toISOString();
  let state = await loadEngagementState(store);

  if (state.job?.busyUntil && Date.parse(state.job.busyUntil) > started) {
    return { ok: true, done: false, skipped: true, busy: true, message: "En hämtning pågår redan.", remaining: state.job.queue.length };
  }

  if (!state.job) {
    const wall = userNow();
    if (opts.mode === "auto" && !autoDue(state, wall)) return { ok: true, done: true, skipped: true, message: "Veckans hämtning är redan gjord.", remaining: 0 };
    if (opts.mode === "manual" && !opts.postId && state.lastRunAt && started - Date.parse(state.lastRunAt) < MANUAL_COOLDOWN_MS) {
      return { ok: true, done: true, skipped: true, message: "Statistiken hämtades alldeles nyss. Vänta en halv minut innan du hämtar igen.", remaining: 0 };
    }

    // A single post is fetched as it is. A full run first refreshes the post list from LinkedIn.
    const refreshed = opts.postId ? { notice: state.notice, keys: null } : await refreshPosts(store, nowIso);
    const posts = await loadPosts(store);
    const recent = posts.filter((p) => started - postTime(p) <= WINDOW_DAYS * DAY_MS).sort(newestFirst);
    const queue = opts.postId ? posts.filter((p) => p.id === opts.postId).map((p) => p.id) : recent.slice(0, MAX_POSTS_PER_RUN).map((p) => p.id);
    if (opts.postId && !queue.length) return stop("Inlägget finns inte i Navet.");

    state = {
      ...state,
      lastRunAt: nowIso,
      lastAutoDay: opts.mode === "auto" ? dayKey(wall) : state.lastAutoDay,
      lastError: null,
      apifyRejected: false,
      notice: refreshed.notice,
      postFieldKeys: refreshed.keys ?? state.postFieldKeys,
      job: { startedAt: nowIso, mode: opts.mode, queue, total: queue.length, records: 0, failed: 0, busyUntil: null },
    };
    if (!queue.length) {
      // Nothing to fetch. The week only counts as done when the post list itself could be read.
      const listOk = !refreshed.notice;
      await saveState(store, {
        ...state,
        job: null,
        lastFinishedAt: nowIso,
        lastRecords: 0,
        lastPosts: 0,
        lastAutoWeek: opts.mode === "auto" && listOk ? weekKey(wall) : state.lastAutoWeek,
      });
      return { ok: true, done: true, message: refreshed.notice ?? `Inga inlägg från de senaste ${WINDOW_DAYS} dagarna att hämta statistik för.`, remaining: 0 };
    }
    await saveState(store, state);
  }

  let job = state.job!;
  let lastPostError: string | null = null;
  while (job.queue.length && Date.now() - started < TIME_BUDGET_MS) {
    const post = (await loadPosts(store)).find((p) => p.id === job.queue[0]);
    job = { ...job, busyUntil: new Date(Date.now() + BUSY_MS).toISOString() };
    state = { ...state, job };
    await saveState(store, state);

    const result = post ? await fetchPost(store, token, post, nowIso) : { records: 0, error: null, fatal: null, keys: null };
    if (result.keys && result.keys.join("|") !== state.engagerFieldKeys.join("|")) {
      // Field names only. Names and comments are never written to the log.
      console.info(`[navet] apify engagers fält: ${result.keys.join(", ")}`);
      state = { ...state, engagerFieldKeys: result.keys };
    }
    job = { ...job, queue: job.queue.slice(1), records: job.records + result.records, failed: job.failed + (result.error ? 1 : 0), busyUntil: null };
    state = { ...state, job };
    if (result.error) lastPostError = result.error;

    if (result.fatal) {
      const message = (result.fatal as Error).message;
      await saveState(store, { ...state, job: null, lastFinishedAt: new Date().toISOString(), lastError: message, apifyRejected: result.fatal instanceof ApifyAuthError, lastRecords: job.records, lastPosts: job.total - job.queue.length });
      return stop(message);
    }
    await saveState(store, state);
  }

  if (job.queue.length) {
    return { ok: true, done: false, message: `${job.total - job.queue.length} av ${job.total} inlägg hämtade.`, remaining: job.queue.length };
  }

  const allFailed = job.failed === job.total;
  const lastError = allFailed ? lastPostError : null;
  await saveState(store, {
    ...state,
    job: null,
    lastFinishedAt: new Date().toISOString(),
    lastError,
    lastRecords: job.records,
    lastPosts: job.total,
    // A run where every post failed is tried again tomorrow instead of counting as this week's.
    lastAutoWeek: job.mode === "auto" && !allFailed ? weekKey(userNow()) : state.lastAutoWeek,
  });
  if (allFailed) return stop(lastPostError ?? "Hämtningen misslyckades.");
  const partly = job.failed ? ` ${job.failed} av dem kunde inte läsas helt.` : "";
  return { ok: true, done: true, message: `Statistik hämtad för ${job.total} inlägg (${job.records} poster från Apify).${partly}`, remaining: 0 };
}

// ---- Reading -------------------------------------------------------------------------------

export interface EngagementOverview {
  /** not_configured = APIFY_TOKEN missing, locked = Navet is public without password */
  state: "not_configured" | "locked" | "ready";
  /** False when the post list cannot be refreshed from LinkedIn (no LinkedIn token) */
  linkedinPosts: boolean;
  configWarning: string | null;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
  notice: string | null;
  /** A run is in progress or waiting to be continued */
  running: { total: number; remaining: number } | null;
  autoDue: boolean;
  lastRecords: number;
  /** The period the people and the summary cover, in days */
  days: number;
  windowDays: number;
  posts: LinkedInPost[];
  people: EngagedPerson[];
  summary: { posts: number; reactions: number; comments: number; people: number; bySegment: Record<LeadSegment, number> };
}

const emptySummary = (): EngagementOverview["summary"] => ({ posts: 0, reactions: 0, comments: 0, people: 0, bySegment: { yh: 0, public: 0, company: 0, ugl: 0, other: 0 } });
const MAX_POSTS_SHOWN = 40;
const MAX_PEOPLE = 500;

/** Everything the LinkedIn page shows. Without a token, or when locked, nothing is served. */
export async function engagementOverview(store: NavetStore, days = 30): Promise<EngagementOverview> {
  const base = { linkedinPosts: linkedinTokenConfigured(), configWarning: apifyConfigWarning(), days, windowDays: WINDOW_DAYS };
  const nothing = { lastRunAt: null, lastFinishedAt: null, lastError: null, notice: null, running: null, autoDue: false, lastRecords: 0, posts: [], people: [], summary: emptySummary() };
  if (!apifyConfigured()) return { ...base, ...nothing, state: "not_configured" };
  if (!integrationsUnlocked()) return { ...base, ...nothing, state: "locked" };

  const state = await loadEngagementState(store);
  const now = Date.now();
  const posts = (await loadPosts(store)).filter((p) => now - postTime(p) <= days * DAY_MS).sort(newestFirst).slice(0, MAX_POSTS_SHOWN);
  const lists = await Promise.all(posts.map((p) => loadEngagers(store, p.id)));
  const contactIds = new Set((await loadContacts(store)).map((c) => c.id));

  // Posts are newest first, so the first time a person shows up is their latest engagement.
  const people = new Map<string, EngagedPerson>();
  posts.forEach((post, i) => {
    for (const e of lists[i]) {
      const p = people.get(e.id);
      if (!p) {
        people.set(e.id, {
          id: e.id,
          name: e.name,
          subtitle: e.subtitle,
          title: e.title,
          company: e.company,
          profileUrl: e.profileUrl,
          segment: e.segment,
          likes: e.kind === "liker" ? 1 : 0,
          comments: e.kind === "commenter" ? 1 : 0,
          postIds: [post.id],
          latestPostId: post.id,
          latestKind: e.kind,
          latestComment: e.comment,
          isContact: contactIds.has(e.id),
          isNew: Boolean(state.lastRunAt && e.firstSeenAt >= state.lastRunAt),
          firstSeenAt: e.firstSeenAt,
        });
        continue;
      }
      if (e.kind === "liker") p.likes++;
      else p.comments++;
      if (!p.postIds.includes(post.id)) p.postIds.push(post.id);
      // A comment says more than a like on the same post.
      if (e.kind === "commenter" && p.latestPostId === post.id) {
        p.latestKind = "commenter";
        p.latestComment = e.comment;
      }
      p.latestComment ??= e.comment;
      if (e.firstSeenAt < p.firstSeenAt) p.firstSeenAt = e.firstSeenAt;
      p.isNew = p.isNew && Boolean(state.lastRunAt && e.firstSeenAt >= state.lastRunAt);
    }
  });

  // Strongest signal first. A comment weighs more than a like, engaging with several posts more
  // than with one, and the target groups come before the rest when the signal is the same.
  const score = (p: EngagedPerson) => p.comments * 3 + p.likes + (p.postIds.length - 1) * 2 + (p.segment === "other" ? 0 : 0.5);
  const sorted = [...people.values()].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "sv"));

  const summary = emptySummary();
  summary.posts = posts.length;
  summary.people = sorted.length;
  for (const p of posts) {
    summary.reactions += p.stats?.reactions ?? p.stats?.likersFetched ?? 0;
    summary.comments += p.stats?.comments ?? p.stats?.commentersFetched ?? 0;
  }
  for (const p of sorted) summary.bySegment[p.segment]++;

  return {
    ...base,
    state: "ready",
    lastRunAt: state.lastRunAt,
    lastFinishedAt: state.lastFinishedAt,
    lastError: state.lastError,
    notice: state.notice,
    running: state.job ? { total: state.job.total, remaining: state.job.queue.length } : null,
    autoDue: autoDue(state),
    lastRecords: state.lastRecords,
    posts,
    people: sorted.slice(0, MAX_PEOPLE),
    summary,
  };
}
