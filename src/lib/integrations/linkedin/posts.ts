import "server-only";
import { createHash } from "node:crypto";
import type { LinkedInPost } from "../../types";
import type { SnapshotRow } from "./api";
import { canon, text } from "./connections";

/**
 * The owner's own posts come from LinkedIn's official Member Snapshot API, domain
 * MEMBER_SHARE_INFO ("all shared or re-shared posts, including date, URL, shared comments, and
 * visibility status"). As with the contacts, LinkedIn does not document the field names, so they
 * are read from the response and reported.
 */
export const POSTS_DOMAIN = "MEMBER_SHARE_INFO";

export const POST_FIELDS = ["date", "link", "text", "visibility"] as const;
export type PostField = (typeof POST_FIELDS)[number];
export type PostFieldMap = Record<PostField, string | null>;

const CANDIDATES: Record<PostField, string[]> = {
  date: ["date", "sharedate", "createdat", "created", "publishedat", "postedat", "time", "timestamp"],
  link: ["sharelink", "link", "posturl", "permalink", "url"],
  text: ["sharecommentary", "commentary", "sharedcomment", "comment", "text", "content"],
  visibility: ["visibility"],
};

const FIELD_LABEL: Record<PostField, string> = { date: "datum", link: "länk", text: "text", visibility: "synlighet" };

export function detectPostFields(keys: string[]): PostFieldMap {
  const byCanon = new Map(keys.map((k) => [canon(k), k]));
  const map = {} as PostFieldMap;
  for (const field of POST_FIELDS) map[field] = CANDIDATES[field].map((c) => byCanon.get(c)).find((k) => k !== undefined) ?? null;
  return map;
}

/** Field names only, never any values. */
export function describePostFields(keys: string[], map: PostFieldMap): string {
  if (!keys.length) return "";
  const used = POST_FIELDS.filter((f) => map[f]).map((f) => `${FIELD_LABEL[f]} från ”${map[f]}”`);
  const missing = POST_FIELDS.filter((f) => !map[f]).map((f) => FIELD_LABEL[f]);
  return [
    `Fält för inlägg från LinkedIn: ${keys.join(", ")}.`,
    used.length ? `Navet läser ${used.join(", ")}.` : "",
    missing.length ? `Hittar inget fält för ${missing.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const URN = /urn:li:(share|activity|ugcPost):(\d+)/i;

/** Only real LinkedIn addresses are kept, since the value is sent on to Apify and shown as a link. */
export function cleanPostUrl(raw: string | null): string | null {
  if (!raw) return null;
  let decoded = raw.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Not percent-encoded in a way that can be decoded: use it as it is.
  }
  const candidate = /^https?:\/\//i.test(decoded) ? decoded : /^(www\.)?linkedin\.com\//i.test(decoded) ? `https://${decoded}` : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.hostname !== "linkedin.com" && !url.hostname.endsWith(".linkedin.com")) return null;
    const urn = URN.exec(decodeURIComponent(url.pathname));
    if (urn) return `https://www.linkedin.com/feed/update/urn:li:${urn[1]}:${urn[2]}/`;
    if (!/^\/(posts|feed\/update|pulse)\//.test(url.pathname)) return null;
    return `https://www.linkedin.com${url.pathname}`;
  } catch {
    return null;
  }
}

/** The same post gets the same id on every fetch. */
export function postId(url: string): string {
  const urn = URN.exec(url);
  if (urn) return `urn:li:${urn[1]}:${urn[2]}`;
  const slug = /-(activity|share|ugcPost)-(\d+)/i.exec(url);
  if (slug) return `urn:li:${slug[1]}:${slug[2]}`;
  return `post:${createHash("sha256").update(url).digest("hex").slice(0, 20)}`;
}

/** ISO timestamp for "2026-10-05 08:12:33" (LinkedIn's export format, UTC), ISO and epoch milliseconds. Otherwise null. */
export function parsePostDate(raw: string | null): string | null {
  if (!raw) return null;
  const plain = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(raw);
  const ms = plain ? Date.parse(`${plain[1]}T${plain[2]}Z`) : /^\d{12,13}$/.test(raw) ? Number(raw) : Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const EXCERPT = 280;

export function excerpt(value: string | null): string | null {
  const s = value?.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > EXCERPT ? `${s.slice(0, EXCERPT - 1).trimEnd()}…` : s;
}

/** A LinkedIn row as a post, or null when the row has no usable link. */
export function toPost(row: SnapshotRow, map: PostFieldMap, now: string): LinkedInPost | null {
  const url = cleanPostUrl(text(row, map.link));
  if (!url) return null;
  return {
    id: postId(url),
    url,
    text: excerpt(text(row, map.text)),
    publishedAt: parsePostDate(text(row, map.date)),
    visibility: text(row, map.visibility),
    source: "linkedin",
    addedAt: now,
    stats: null,
  };
}

/** A post the owner pasted the link to, for when LinkedIn's snapshot has not caught up. */
export function manualPost(rawUrl: string, now: string): LinkedInPost | null {
  const url = cleanPostUrl(rawUrl);
  if (!url) return null;
  return { id: postId(url), url, text: null, publishedAt: null, visibility: null, source: "manual", addedAt: now, stats: null };
}
