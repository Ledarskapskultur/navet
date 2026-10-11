import "server-only";
import { createHash } from "node:crypto";
import type { LinkedInContact } from "../../types";
import type { SnapshotRow } from "./api";

/**
 * LinkedIn documents that the CONNECTIONS domain holds name, position, company and connection
 * date, but not what the fields are called. Navet therefore reads the field names from the
 * response, maps them with the candidates below and reports openly what it found and what it
 * could not place (see describeFields). Nothing is guessed silently.
 */
export const CONTACT_FIELDS = ["firstName", "lastName", "fullName", "title", "company", "connectedOn", "profileUrl"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

/** Which of LinkedIn's field names each part of a contact is read from (null = not found) */
export type FieldMap = Record<ContactField, string | null>;

/** Candidates are compared without case, spaces and punctuation: "First Name" = "first_name" = "firstName". */
const CANDIDATES: Record<ContactField, string[]> = {
  firstName: ["firstname", "givenname"],
  lastName: ["lastname", "familyname", "surname"],
  fullName: ["name", "fullname", "connectionname"],
  title: ["position", "title", "jobtitle", "headline", "occupation"],
  company: ["company", "companyname", "organization", "organisation", "employer"],
  connectedOn: ["connectedon", "connectedat", "connectiondate", "dateconnected", "connected"],
  profileUrl: ["url", "profileurl", "publicprofileurl", "linkedinurl", "linkedinprofile", "profile"],
};

export const FIELD_LABEL: Record<ContactField, string> = {
  firstName: "förnamn",
  lastName: "efternamn",
  fullName: "namn",
  title: "titel",
  company: "företag",
  connectedOn: "kontaktdatum",
  profileUrl: "profil-URL",
};

export const canon = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

export function detectFields(keys: string[]): FieldMap {
  const byCanon = new Map(keys.map((k) => [canon(k), k]));
  const map = {} as FieldMap;
  for (const field of CONTACT_FIELDS) {
    map[field] = CANDIDATES[field].map((c) => byCanon.get(c)).find((k) => k !== undefined) ?? null;
  }
  return map;
}

/** True when a name can be read at all. Without it the rows cannot become contacts. */
export const hasNameField = (map: FieldMap) => Boolean(map.fullName || map.firstName || map.lastName);

/**
 * A sentence about how LinkedIn's fields were understood: the field names LinkedIn sent, what
 * Navet reads from each of them, and what is missing. Field names only, never any values.
 */
export function describeFields(keys: string[], map: FieldMap): string {
  if (!keys.length) return "";
  const used = CONTACT_FIELDS.filter((f) => map[f]).map((f) => `${FIELD_LABEL[f]} från ”${map[f]}”`);
  const wanted: ContactField[] = ["title", "company", "connectedOn", "profileUrl"];
  const missing = [...(hasNameField(map) ? [] : (["fullName"] as ContactField[])), ...wanted.filter((f) => !map[f])].map((f) => FIELD_LABEL[f]);
  const taken = new Set(Object.values(map));
  const unused = keys.filter((k) => !taken.has(k));
  return [
    `Fält från LinkedIn: ${keys.join(", ")}.`,
    used.length ? `Navet läser ${used.join(", ")}.` : "",
    missing.length ? `Hittar inget fält för ${missing.join(", ")}.` : "",
    unused.length ? `Används inte: ${unused.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function text(row: SnapshotRow, key: string | null): string | null {
  if (!key) return null;
  const v = row[key];
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
const pad = (n: string) => n.padStart(2, "0");

/** YYYY-MM-DD when the format is recognised ("11 Oct 2026", "Oct 11, 2026", ISO, epoch ms), otherwise the text unchanged. */
export function parseConnectedOn(raw: string | null): string | null {
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?,?\s+(\d{4})$/.exec(raw);
  if (dmy && MONTHS[dmy[2].toLowerCase()]) return `${dmy[3]}-${MONTHS[dmy[2].toLowerCase()]}-${pad(dmy[1])}`;
  const mdy = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(raw);
  if (mdy && MONTHS[mdy[1].toLowerCase()]) return `${mdy[3]}-${MONTHS[mdy[1].toLowerCase()]}-${pad(mdy[2])}`;
  if (/^\d{12,13}$/.test(raw)) return new Date(Number(raw)).toISOString().slice(0, 10);
  return raw;
}

/** Only real LinkedIn addresses are kept, since the value ends up as a link in the browser. */
export function cleanProfileUrl(raw: string | null): string | null {
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : /^(www\.)?linkedin\.com\//i.test(raw) ? `https://${raw}` : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.hostname !== "linkedin.com" && !url.hostname.endsWith(".linkedin.com")) return null;
    return `https://${url.hostname}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** The same person gets the same id on every fetch, so a new fetch updates instead of duplicating. */
function contactId(c: Pick<LinkedInContact, "name" | "company" | "connectedOn" | "profileUrl">): string {
  if (c.profileUrl) return `li:${c.profileUrl.replace(/^https:\/\/(www\.)?/, "").toLowerCase()}`;
  const basis = [c.name, c.company ?? "", c.connectedOn ?? ""].join("|").toLowerCase();
  return `li:${createHash("sha256").update(basis).digest("hex").slice(0, 20)}`;
}

/** A LinkedIn row as a contact, or null when the row has no name (for example a closed account). */
export function toContact(row: SnapshotRow, map: FieldMap, now: string): LinkedInContact | null {
  const name = [text(row, map.firstName), text(row, map.lastName)].filter(Boolean).join(" ") || text(row, map.fullName);
  if (!name) return null;
  const partial = {
    name,
    title: text(row, map.title),
    company: text(row, map.company),
    connectedOn: parseConnectedOn(text(row, map.connectedOn)),
    profileUrl: cleanProfileUrl(text(row, map.profileUrl)),
  };
  return { id: contactId(partial), ...partial, source: "linkedin", firstSeenAt: now };
}
