import "server-only";

/**
 * Thin client for LinkedIn's Member Data Portability API (Member Snapshot API).
 * Official, documented and read-only: Navet never scrapes and never changes anything on LinkedIn.
 * https://learn.microsoft.com/linkedin/dma/member-data-portability/shared/member-snapshot-api
 */
const SNAPSHOT = "https://api.linkedin.com/rest/memberSnapshotData";

/** The only version the snapshot endpoint accepts. Anything else gives 426. */
export const LINKEDIN_VERSION = "202312";

/** The token is missing, wrong or expired. A new one has to be created in LinkedIn's token tool. */
export class LinkedInAuthError extends Error {
  constructor(
    message = "LinkedIn godkänner inte åtkomsttoken. Den är ogiltig, har gått ut eller saknar behörigheten r_dma_portability_self_serve. Skapa en ny i LinkedIns tokenverktyg, lägg in den i LINKEDIN_ACCESS_TOKEN och gör en ny deploy.",
  ) {
    super(message);
  }
}

/** LinkedIn answered, but with an error (wrong version, throttling, outage …). */
export class LinkedInError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function describe(status: number, code: string): string {
  if (status === 426) return `LinkedIn accepterar inte API-versionen (Linkedin-Version ${LINKEDIN_VERSION}). Navet behöver uppdateras.`;
  if (status === 429) return "LinkedIn begränsar antalet anrop just nu. Försök igen senare.";
  if (status >= 500) return "LinkedIn svarar inte just nu. Försök igen om en stund.";
  return `LinkedIn svarade med fel ${status}${code ? ` (${code})` : ""}.`;
}

export type SnapshotRow = Record<string, unknown>;

export interface SnapshotPage {
  rows: SnapshotRow[];
  /** The page LinkedIn says comes next, when the response has a "next" link */
  nextStart: number | null;
}

interface SnapshotResponse {
  paging?: { links?: { rel?: string; href?: string }[] };
  elements?: { snapshotDomain?: string; snapshotData?: unknown }[];
}

interface ErrorBody {
  message?: string;
  code?: string;
  serviceErrorCode?: number;
}

const NO_DATA = /no data found/i;

function nextStart(res: SnapshotResponse): number | null {
  const href = res.paging?.links?.find((l) => l.rel === "next")?.href;
  if (!href) return null;
  const start = Number(new URLSearchParams(href.split("?")[1] ?? "").get("start"));
  return Number.isInteger(start) && start >= 0 ? start : null;
}

/**
 * One page of a snapshot domain. `start` is a page number, not a row offset.
 * Returns null when LinkedIn says there is no data: either the last page has been passed, or
 * (on the first page) the snapshot has not been prepared yet.
 */
export async function fetchSnapshotPage(token: string, domain: string, start: number, attempt = 0): Promise<SnapshotPage | null> {
  const q = new URLSearchParams({ q: "criteria", domain });
  if (start > 0) q.set("start", String(start));
  let res: Response;
  try {
    res = await fetch(`${SNAPSHOT}?${q}`, {
      headers: { Authorization: `Bearer ${token}`, "Linkedin-Version": LINKEDIN_VERSION },
      cache: "no-store",
    });
  } catch {
    throw new LinkedInError(0, "network", "Kunde inte nå LinkedIn. Kontrollera anslutningen och försök igen.");
  }
  if ((res.status === 429 || res.status === 503) && attempt === 0) {
    const wait = Math.min(Number(res.headers.get("retry-after")) || 1, 3);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return fetchSnapshotPage(token, domain, start, 1);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorBody | null;
    // "No data found for this memberId" is how LinkedIn says the pages have run out.
    if (res.status === 404 || NO_DATA.test(body?.message ?? "")) return null;
    if (res.status === 401 || res.status === 403) throw new LinkedInAuthError();
    const code = body?.code ?? "";
    throw new LinkedInError(res.status, code, describe(res.status, code));
  }
  const data = (await res.json().catch(() => null)) as SnapshotResponse | null;
  const rows = (data?.elements ?? []).flatMap((e) => (Array.isArray(e.snapshotData) ? e.snapshotData : []));
  return {
    rows: rows.filter((r): r is SnapshotRow => typeof r === "object" && r !== null && !Array.isArray(r)),
    nextStart: data ? nextStart(data) : null,
  };
}
