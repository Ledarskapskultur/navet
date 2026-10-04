import "server-only";
import type { NavetItem } from "../types";

/**
 * Landing pages that may send booking requests to Navet. The key is the last part of
 * the form URL: POST /api/inbound/<key>. Add a line here to connect a new site.
 */
export const FORM_SOURCES: Record<string, { label: string; projectId: string | null }> = {
  ugl: { label: "UGL Sverige", projectId: "p-ugl" },
  ledarskapsmetoden: { label: "Ledarskapsmetoden", projectId: "p-lm" },
  dj: { label: "Trolleri & DJ", projectId: "p-dj" },
  allmant: { label: "Webbplats", projectId: null },
};

export interface InboundForm {
  name?: string;
  email?: string;
  phone?: string;
  organization?: string;
  subject?: string;
  date?: string;
  participants?: string;
  message?: string;
  page?: string;
  /** "signup" for newsletter/watch-list sign-ups (not urgent); default is a booking request */
  kind?: string;
  /** Honeypot – real visitors never fill this in */
  website?: string;
}

const MAX = { short: 200, long: 5000 };

function clean(v: unknown, max = MAX.short): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\u0000/g, "").trim();
  return s ? s.slice(0, max) : null;
}

export class InboundError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Validates a submitted form and turns it into the fields of a Navet booking request. */
export function formToRequest(sourceKey: string, raw: InboundForm): Partial<NavetItem> & { title: string } {
  const source = FORM_SOURCES[sourceKey];
  if (!source) throw new InboundError("Okänd källa", 404);
  if (clean(raw.website)) throw new InboundError("Spam", 422);

  const name = clean(raw.name);
  const email = clean(raw.email);
  const phone = clean(raw.phone, 40);
  const organization = clean(raw.organization);
  if (!email && !phone) throw new InboundError("Ange e-post eller telefon");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InboundError("Ogiltig e-postadress");

  const subject = clean(raw.subject) ?? "Förfrågan";
  const dateText = clean(raw.date, 60);
  const eventDate = dateText && /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? dateText : null;
  const participants = clean(raw.participants, 60);
  const message = clean(raw.message, MAX.long);

  const description = [
    message,
    participants ? `Antal deltagare: ${participants}` : null,
    dateText && !eventDate ? `Önskat datum: ${dateText}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    title: `${subject} – ${organization ?? name ?? email ?? phone}`,
    description: description || null,
    type: "request",
    status: "inbox",
    source: "web_form",
    stage: "new",
    // Bookings and questions need an answer soon; newsletter sign-ups don't.
    priority: raw.kind === "signup" ? "normal" : "high",
    projectId: source.projectId,
    person: name,
    eventDate,
    origin: clean(raw.page, 500) ?? source.label,
    contact: { name, email, phone, organization },
  };
}

// Simple per-instance rate limit: max 10 submissions per IP per 10 minutes.
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

/** FORM_ALLOWED_ORIGINS="https://uglsverige.store,https://ledarskapskultur.se" – empty means any origin. */
export function originAllowed(origin: string | null): boolean {
  const list = (process.env.FORM_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (!list.length || !origin) return true;
  return list.includes(origin.replace(/\/$/, ""));
}
